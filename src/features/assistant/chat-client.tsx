"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatEvent, ChatMessage, ChatProvider, ChatSnapshot } from "./chat-model";
import { uploadPrivateMealPhoto } from "../meals/photo-upload";
import { confirmAction } from "../../components/confirmation-state";
type DraftPhoto = { id: string; name: string };
type ChatClient = {
  scrollState: () => { top: number; stick: boolean }; recordScroll: (top: number, stick: boolean) => void;
  enabled: boolean; data: ChatSnapshot | null; messages: ChatMessage[]; draft: string; setDraft: (value: string) => void;
  quote: ChatMessage | null; setQuote: (value: ChatMessage | null) => void; photos: DraftPhoto[]; removePhoto: (id: string) => void;
  error: string; loading: boolean; delayed: boolean; busy: boolean; managing: boolean; uploading: string; refresh: () => Promise<void>; more: () => Promise<void>;
  send: (action?: "send" | "retry" | "continue", messageId?: string) => Promise<void>;
  control: (action: "select_model" | "new" | "stop" | "enable" | "revoke" | "clear_followup", provider?: ChatProvider) => Promise<boolean>;
  addPhotos: (files: File[]) => Promise<void>;
};
const Context = createContext<ChatClient | null>(null);
export function useAssistantChat() { const value = useContext(Context); if (!value) throw Error("ChatProvider missing"); return value; }
export function AssistantChatProvider({ enabled, open, accountId, children }: { enabled: boolean; open: boolean; accountId: string; children: ReactNode }) {
  const [data, setData] = useState<ChatSnapshot | null>(null), [messages, setMessages] = useState<ChatMessage[]>([]), [draft, setDraft] = useState(""), [quote, setQuote] = useState<ChatMessage | null>(null), [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [delayed, setDelayed] = useState(false), [running, setRunning] = useState(false), [managing, setManaging] = useState(false), [uploading, setUploading] = useState("");
  const request = useRef<AbortController | null>(null), reading = useRef(false), current = useRef<ChatSnapshot | null>(null), generation = useRef(0), alive = useRef(true);
  const scroll = useRef({ top: 0, stick: true });
  const mutating = useRef(false);
  const scrollState = useCallback(() => ({ ...scroll.current }), []);
  const recordScroll = useCallback((top:number,stick:boolean) => { scroll.current = { top,stick }; }, []);
  const apply = useCallback((snapshot: ChatSnapshot) => {
    if (!alive.current) return;
    const changed = current.current?.conversationId !== snapshot.conversationId;
    current.current = snapshot; setData(snapshot);
    setMessages(previous => { const merged = new Map((changed ? [] : previous).map(row => [row.id, row])); for (const row of snapshot.messages) merged.set(row.id, row); return [...merged.values()].sort((a,b) => a.seq - b.seq).slice(-50); });
  }, []);
  const read = useCallback(async (before?: number) => {
    if (!enabled || reading.current || mutating.current) return;
    const ticket = generation.current; reading.current = true; setLoading(true); setError("");
    try {
      const response = await fetch("/api/assistant-chat" + (before ? "?before=" + before : ""), { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
      const payload = await response.json(); if (!response.ok) throw Error(payload.error ?? "聊天暂时无法读取。");
      if (ticket === generation.current) apply(payload);
    } catch (failure) { if (ticket === generation.current && alive.current) setError(failure instanceof Error ? failure.message : "读取未完成，请重试。"); }
    finally { reading.current = false; if (alive.current) setLoading(false); }
  }, [enabled, apply]);
  const refresh = useCallback(async () => { await read(); }, [read]);
  useEffect(() => {
    if (!enabled) return;
    const update = () => { const viewport = window.visualViewport; document.documentElement.style.setProperty("--assistant-viewport-height",(viewport?.height ?? innerHeight) + "px"); document.documentElement.style.setProperty("--assistant-viewport-top",(viewport?.offsetTop ?? 0) + "px"); };
    update(); window.addEventListener("resize",update); window.visualViewport?.addEventListener("resize",update); window.visualViewport?.addEventListener("scroll",update);
    return () => { window.removeEventListener("resize",update); window.visualViewport?.removeEventListener("resize",update); window.visualViewport?.removeEventListener("scroll",update); };
  }, [enabled]);
  useEffect(() => { alive.current = true; const epoch = generation.current; return () => { alive.current = false; generation.current = epoch + 1; request.current?.abort(); }; }, [accountId]);
  useEffect(() => { if (!enabled || !open) return; const frame = requestAnimationFrame(() => void read()); const focus = () => { if (!document.hidden && !request.current) void read(); }; window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus); window.addEventListener("formward-record-saved", focus); return () => { cancelAnimationFrame(frame); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); window.removeEventListener("formward-record-saved", focus); }; }, [enabled, open, read]);
  useEffect(() => { if (!open || !data?.activeRunId || running) return; const timer = setInterval(() => void read(), 1800); return () => clearInterval(timer); }, [open, data?.activeRunId, running, read]);
  useEffect(() => { if (!enabled || !open) return; const timer = setInterval(() => { if (!document.hidden && !request.current) void read(); },60000); return () => clearInterval(timer); }, [enabled,open,read]);
  useEffect(() => { if (!open || !data?.usage.resetAt) return; const timer = setTimeout(() => { if (!request.current) void read(); },Math.max(1000,Date.parse(data.usage.resetAt)-Date.now()+200)); return () => clearTimeout(timer); }, [open,data?.usage.resetAt,read]);
  useEffect(() => { if (!loading) return; const timer = setTimeout(() => setDelayed(true), 200); return () => clearTimeout(timer); }, [loading]);
  useEffect(() => { if (!loading && delayed) { const frame = requestAnimationFrame(() => setDelayed(false)); return () => cancelAnimationFrame(frame); } }, [loading, delayed]);
  useEffect(() => { if (!draft.trim() && !photos.length) return; const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect); }, [draft, photos]);
  async function control(action: Parameters<ChatClient["control"]>[0], provider?: ChatProvider) {
    if (!enabled || mutating.current) return false;
    if (action === "new" && (draft.trim() || photos.length || messages.some(row => row.references.some(ref => ref.kind === "preview")))) {
      if (!await confirmAction({ title: "开始新对话？", message: "当前输入将清空，已有提交仍可在AI提交记录中查看和确认。", confirmLabel: "开始新对话", cancelLabel: "继续当前对话" })) return false;
    }
    if (action === "revoke" && !await confirmAction({ title: "撤销站内授权？", message: "此模型将停止访问，原待确认提交也不能继续保存。", confirmLabel: "撤销授权", danger: true })) return false;
    mutating.current = true; setManaging(true); generation.current++;
    try {
      setError(""); const response = await fetch("/api/assistant-chat/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(provider ? { provider } : {}), ...(action === "stop" ? { runId: current.current?.activeRunId } : {}) }) });
      const payload = await response.json(); if (!response.ok) throw Error(payload.error ?? "操作未完成。");
      if (action === "new") { setDraft(""); setPhotos([]); setQuote(null); generation.current++; scroll.current = { top: 0, stick: true }; }
      apply(payload); return true;
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "操作未完成，请重试。"); return false; }
    finally { mutating.current = false; if (alive.current) setManaging(false); }
  }
  async function send(action: "send" | "retry" | "continue" = "send", messageId?: string) {
    const snapshot = current.current;
    if (!snapshot || request.current || mutating.current || uploading || snapshot.activeRunId || !enabled || action === "send" && !draft.trim() && !photos.length) return;
    const controller = new AbortController(); request.current = controller; setRunning(true); setError("");
    const sentDraft = draft, sentPhotoIds = new Set(photos.map(photo => photo.id)), sentQuoteId = quote?.id;
    try {
      const response = await fetch("/api/assistant-chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ action, requestId: crypto.randomUUID(), provider: snapshot.provider, conversationId: snapshot.conversationId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(action === "send" ? { text: draft, imageIds: photos.map(photo => photo.id), ...(quote ? { replyToId: quote.id } : {}) } : { messageId }) }) });
      if (!response.ok) { const failure = await response.json(); throw Error(failure.error ?? "发送未完成。"); }
      if (action === "send") { setDraft(current => current === sentDraft ? "" : current); setQuote(current => current?.id === sentQuoteId ? null : current); setPhotos(current => current.filter(photo => !sentPhotoIds.has(photo.id))); }
      if (!response.body) throw Error("回复连接未建立。");
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const part = await reader.read(); buffer += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0,index); buffer = buffer.slice(index + 2);
          const line = block.split("\n").find(line => line.startsWith("data: ")); if (!line) continue;
          const event = JSON.parse(line.slice(6)) as ChatEvent;
          if (event.type === "snapshot") apply(event.snapshot);
          if (event.type === "usage") { if (current.current) { current.current = { ...current.current, usage: event.usage }; setData(current.current); } }
          if (event.type === "message") setMessages(previous => { const next = new Map(previous.map(row => [row.id,row])); next.set(event.message.id,event.message); return [...next.values()].sort((a,b) => a.seq - b.seq).slice(-50); });
        }
        if (part.done) break;
      }
    } catch (failure) { if (alive.current) setError(controller.signal.aborted ? "连接已中断，已保存的内容可重新读取。" : failure instanceof Error ? failure.message : "回复未完成。"); }
    finally { if (request.current === controller) request.current = null; if (alive.current) { setRunning(false); await read(); window.dispatchEvent(new Event("formward-assistant-updated")); } }
  }
  async function addPhotos(files: File[]) {
    if (uploading || photos.length + files.length > 8) { setError("每条消息最多8张照片。"); return; }
    setError("");
    try { for (const file of files) { const result = await uploadPrivateMealPhoto(file, label => { if (alive.current) setUploading(label); }); if (alive.current) setPhotos(previous => previous.some(photo => photo.id === result.id) ? previous : [...previous, { id: result.id, name: file.name }]); } }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "照片上传未完成，请重试。"); }
    finally { if (alive.current) setUploading(""); }
  }
  return <Context.Provider value={{ scrollState, recordScroll, enabled, data, messages, draft, setDraft, quote, setQuote, photos, removePhoto: id => setPhotos(previous => previous.filter(photo => photo.id !== id)), error, loading, delayed, busy: running || !!data?.activeRunId, managing, uploading, refresh, more: async () => { if (messages[0]) await read(messages[0].seq); }, send, control, addPhotos }}>{children}</Context.Provider>;
}
