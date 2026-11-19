import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useDelayedReading } from "@/components/local-loading";
import { useAssistantChat } from "./chat-client";
import { Glyph } from "./chat-icon";
import { chatBalance, type ChatBalance, type ChatProvider } from "./chat-model";
import styles from "./chat.module.css";

type BalanceRead = { key: string; balance?: ChatBalance; error?: "session" | "network" };
const resetClock = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function ModelBalance() {
  const { accountId, data, busy } = useAssistantChat();
  const snapshot = data?.usage;
  const [request, setRequest] = useState(() => ({ revision: 0, now: Date.now() }));
  const [read, setRead] = useState<BalanceRead | null>(null);
  const refresh = useCallback(() => {
    const now = Date.now();
    setRequest(current => ({ revision: current.revision + 1, now }));
  }, []);
  const key = [accountId, request.revision, busy, snapshot?.resetAt, snapshot?.available, snapshot?.limit].join("|");
  const current = read?.key === key ? read : null;
  const observed = snapshot && Date.parse(snapshot.resetAt) > request.now ? chatBalance(snapshot) : undefined;
  const last = read?.balance && Date.parse(read.balance.resetAt) > request.now ? read.balance : undefined;
  const balance = current?.error === "session" ? undefined : (current && last) || observed || last;
  const waiting = useDelayedReading(!current && !balance);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/account/entitlements", {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setRead({ key, error: "session" });
          return;
        }
        if (!response.ok) throw Error("额度读取失败");
        const payload: { accountId?: string; usage?: ChatBalance } = await response.json();
        if (controller.signal.aborted) return;
        if (payload.accountId !== accountId) {
          setRead({ key, error: "session" });
          return;
        }
        if (!payload.usage?.remainingPercent || !(Date.parse(payload.usage.resetAt) > Date.now())) {
          throw Error("额度需要重新读取");
        }
        setRead({ key, balance: payload.usage });
      } catch {
        if (!controller.signal.aborted) setRead(previous => ({ key, balance: previous?.balance, error: "network" }));
      }
    }
    void load();
    return () => controller.abort();
  }, [key, accountId]);

  const resetAt = balance?.resetAt;
  useEffect(() => {
    if (!resetAt) return;
    const timer = setTimeout(refresh, Math.max(0, Date.parse(resetAt) - Date.now()) + 200);
    return () => clearTimeout(timer);
  }, [resetAt, refresh]);

  return <div className={styles.modelBalance}>
    <div aria-live="polite" aria-atomic="true">
      {balance && <strong data-chat-remaining>今日剩余 {balance.remainingPercent}</strong>}
      {current?.error
        ? <small>{balance ? "额度更新失败" : "暂时无法读取额度"}</small>
        : balance
          ? <small>模型共用 · 北京时间 {resetClock.format(new Date(balance.resetAt))} 重置</small>
          : waiting && <small>正在读取额度…</small>}
    </div>
    {current?.error && <button type="button" className={styles.balanceRetry} onClick={event => {
      event.currentTarget.closest<HTMLElement>("[popover]")?.focus({ preventScroll: true });
      refresh();
    }}>重试</button>}
  </div>;
}

export function ChatModelMenu({ anchor, selected, dismiss, close, connect, id }: {
  anchor: RefObject<HTMLButtonElement | null>; selected?: ChatProvider; id: string;
  dismiss: () => void; close: () => void; connect: () => void;
}) {
  const { data, busy, managing, control } = useAssistantChat();
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current, button = anchor.current;
    if (!node || !button) return;
    node.showPopover();
    const viewport = window.visualViewport;
    const composer = button.closest<HTMLElement>("." + styles.composer);
    const place = () => {
      const box = button.getBoundingClientRect();
      const top = (viewport?.offsetTop ?? 0) + 8;
      const left = (viewport?.offsetLeft ?? 0) + 12;
      const right = left + (viewport?.width ?? innerWidth) - 24;
      const bottom = top + (viewport?.height ?? innerHeight) - 16;
      const composerTop = composer?.getBoundingClientRect().top ?? box.top;
      const anchorTop = composerTop - top >= 184 ? composerTop : box.top;
      const above = anchorTop - top - 8;
      const below = bottom - box.bottom - 8;
      const openUp = above >= 180 || above >= below;
      node.style.width = Math.min(256, right - left) + "px";
      node.style.maxHeight = Math.max(0, openUp ? above : below) + "px";
      node.style.setProperty("--model-left", Math.max(left, Math.min(box.right - node.offsetWidth, right - node.offsetWidth)) + "px");
      node.style.setProperty("--model-top", (openUp ? anchorTop - node.offsetHeight - 8 : box.bottom + 8) + "px");
    };
    const observer = new ResizeObserver(place);
    observer.observe(node);
    observer.observe(button);
    if (composer) observer.observe(composer);
    place();
    const focus = node.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)')
      ?? node.querySelector<HTMLElement>("button:not(:disabled)") ?? node;
    focus.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      observer.disconnect();
      if (node.matches(":popover-open")) node.hidePopover();
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, [anchor]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !anchor.current?.contains(target)) dismiss();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor, dismiss]);

  return <div id={id} ref={menu} popover="manual" role="dialog" aria-label="模型与用量"
    tabIndex={-1} className={styles.modelMenu} onKeyDown={event => {
      if (!["ArrowDown","ArrowUp","Home","End"].includes(event.key)) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : index < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1)
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
    <ModelBalance/>
    <div role="menu" aria-label="选择模型">
      {data?.catalog.map(model => <button key={model.id} type="button" role="menuitemradio" aria-checked={model.id === selected}
        disabled={busy || managing || !model.configured || !model.enabled}
        onClick={() => void control("select_model", model.id).then(ok => { if (ok && menu.current?.isConnected) close(); })}>
        <span><strong>{model.label}</strong><small>{model.model}</small>{model.reason && <small>{model.reason}</small>}</span>
        {model.id === selected && <Glyph name="check"/>}
      </button>)}
    </div>
    {busy && <small className={styles.modelBusy}>生成结束后可切换模型</small>}
    <button type="button" className={styles.modelConnection} onClick={connect}>连接详情<Glyph name="more"/></button>
  </div>;
}
