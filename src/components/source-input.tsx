"use client";

import {LocalLoading} from "@/components/local-loading";
import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import {trackPopoverPosition} from "./anchored-popover";

import styles from "./source-input.module.css";

export type SourceRemovalResult = { ok: true; sources: string[] } | { ok: false; error: string };

/** 两列 grid 支持选择与移除；方向键导航时焦点留在来源输入框。 */
export function SourceInput({ label, value, sources, onChange, removeSource, disabled = false, maxLength = 300, compactLabel }: {
  label: string; value: string; sources: string[]; onChange: (value: string) => void;
  removeSource: (label: string) => Promise<SourceRemovalResult>; disabled?: boolean; maxLength?: number; compactLabel?:string;
}) {
  const id = useId(), root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), removing = useRef(false);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [column, setColumn] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(""), [busy, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(false); setActive(-1); }
    };
    const closeWindow = () => { setOpen(false); setActive(-1); };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside);
    window.addEventListener("blur", closeWindow);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside);
      window.removeEventListener("blur", closeWindow);
    };
  }, [open]);
  const options = sources.filter(source => source.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const visible = open && options.length > 0;
  useLayoutEffect(() => {
    if (!compactLabel || !input.current || !menu.current) return;
    const panel = menu.current;
    if (!visible) {
      if (panel.matches(":popover-open")) panel.hidePopover();
      return;
    }
    if (!panel.matches(":popover-open")) panel.showPopover();
    return trackPopoverPosition(panel, input.current, {
      width: Math.max(260, input.current.getBoundingClientRect().width), maxHeight: 176, preferAbove: true,
    });
  }, [compactLabel, visible, options.length]);
  function showHistory() { setQuery(""); setOpen(true); setActive(-1); setColumn(0); }
  function closeHistory() { setOpen(false); setActive(-1); }
  function choose(source: string, pointerSelection = false) {
    if (disabled || busy) return;
    onChange(source);
    if (compactLabel && pointerSelection) input.current?.blur();
    else input.current?.focus({ preventScroll: true });
    closeHistory();
  }
  function remove(source: string) {
    if (disabled || removing.current) return;
    removing.current = true; setError("");
    startTransition(async () => {
      try { const result = await removeSource(source); if (!result.ok) setError(result.error); else setActive(-1); }
      catch { setError("移除未完成，请重试；输入和建议已保留。"); }
      finally { removing.current = false; }
    });
  }
  const field = <input ref={input} id={id} data-input-appearance={compactLabel ? "soft-line" : undefined} role="combobox" aria-label={label} autoComplete="off" maxLength={maxLength} placeholder="输入或选择来源" value={value} disabled={disabled || busy}
      aria-autocomplete="list" aria-haspopup="grid" aria-expanded={visible} aria-controls={`${id}-options`} aria-activedescendant={open && active >= 0 && active < options.length ? `${id}-cell-${active}-${column}` : undefined}
      onFocus={showHistory} onClick={showHistory}
      onChange={event => { onChange(event.target.value); setQuery(event.target.value); setOpen(true); setActive(-1); setColumn(0); setError(""); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true); setColumn(0);
          if (options.length) {
            const next = event.key === "ArrowDown" ? (active + 1) % options.length : active <= 0 ? options.length - 1 : active - 1;
            setActive(next);
            requestAnimationFrame(() => document.getElementById(`${id}-cell-${next}-0`)?.scrollIntoView({ block: "nearest" }));
          }
        }
        if (open && active >= 0 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); setColumn(event.key === "ArrowRight" ? 1 : 0); }
        if (event.key === "Enter" && open && active >= 0 && options[active]) { event.preventDefault(); if (column === 1) remove(options[active]); else choose(options[active]); }
      }} />;
  return <div ref={root} aria-busy={busy||undefined} className={compactLabel ? styles.sourceInput + " " + styles.sourceCompact : styles.sourceInput} onBlur={event => {
    // 手机收起键盘／点历史时可能没有 relatedTarget，不能在点击前隐藏候选。
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) closeHistory();
  }} onKeyDown={event => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); closeHistory(); }
    if (event.key === "Tab" && open) {
      const node = event.currentTarget;
      requestAnimationFrame(() => { if (!node.contains(document.activeElement)) closeHistory(); });
    }
  }}>
    <label htmlFor={id}>{compactLabel || label}</label>
    {compactLabel ? <div className={styles.compactField}>
      {field}
      <span className={styles.compactValue} data-empty={!value} aria-hidden="true">{value || "输入或选择来源"}</span>
      <svg className={styles.compactChevron} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </div> : field}
    <div id={`${id}-options`} ref={menu} popover={compactLabel ? "manual" : undefined} className={styles.sourceOptions} role="grid" aria-label={`${label}历史建议`} hidden={!visible}>
      {options.map((source, index) => <div role="row" key={source}>
        <div id={`${id}-cell-${index}-0`} role="gridcell" aria-selected={index === active && column === 0} className={styles.sourceOption}><button className={styles.sourcePick} type="button" tabIndex={-1} disabled={disabled || busy} onPointerDown={event => { if (event.pointerType === "mouse") event.preventDefault(); }} onClick={event => choose(source, event.detail > 0)}>{source}</button></div>
        <div id={`${id}-cell-${index}-1`} role="gridcell" aria-selected={index === active && column === 1}><button type="button" aria-label={`移除来源建议 ${source}`} title="移除来源建议" disabled={disabled || busy} onPointerDown={event => { if (event.pointerType === "mouse") event.preventDefault(); }} onClick={() => remove(source)}>×</button></div>
      </div>)}
      {!options.length && <div role="row"><div role="gridcell" className={styles.sourceEmpty}>{sources.length ? "没有匹配的来源。" : "暂无历史来源。"}</div></div>}
    </div>
    {busy&&<LocalLoading label="正在移除来源建议…"/>}{error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
