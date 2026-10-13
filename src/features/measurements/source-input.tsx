"use client";

import { useId, useRef, useState, useTransition } from "react";
import { usePageLoading } from "@/components/page-loading-state";
import type { SourceRemovalResult } from "./entry-state";
import styles from "./measurements-view.module.css";

/** 两列 grid 支持选择与移除；方向键导航时焦点留在来源输入框。 */
export function SourceInput({ label, value, sources, onChange, removeSource, disabled = false }: {
  label: string; value: string; sources: string[]; onChange: (value: string) => void;
  removeSource: (label: string) => Promise<SourceRemovalResult>; disabled?: boolean;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null), removing = useRef(false);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [column, setColumn] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(""), [busy, startTransition] = useTransition();
  usePageLoading({ active: busy, label: "正在移除来源建议…" });
  const options = sources.filter(source => source.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function showHistory() { setQuery(""); setOpen(true); setActive(-1); setColumn(0); }
  function closeHistory() { setOpen(false); setActive(-1); }
  function choose(source: string) { if (disabled || busy) return; onChange(source); input.current?.focus(); closeHistory(); }
  function remove(source: string) {
    if (disabled || removing.current) return;
    removing.current = true; setError("");
    startTransition(async () => {
      try { const result = await removeSource(source); if (!result.ok) setError(result.error); else setActive(-1); }
      catch { setError("移除未完成，请重试；输入和建议已保留。"); }
      finally { removing.current = false; }
    });
  }
  return <div className={styles.sourceInput} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeHistory(); }} onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); closeHistory(); } }}>
    <label htmlFor={id}>{label}</label>
    <input ref={input} id={id} role="combobox" aria-label={label} autoComplete="off" maxLength={300} placeholder="输入或选择来源" value={value} disabled={disabled || busy}
      aria-autocomplete="list" aria-haspopup="grid" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && active >= 0 && active < options.length ? `${id}-cell-${active}-${column}` : undefined}
      onFocus={showHistory} onClick={showHistory}
      onChange={event => { onChange(event.target.value); setQuery(event.target.value); setOpen(true); setActive(-1); setColumn(0); setError(""); }}
      onKeyDown={event => {
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
      }} />
    <div id={`${id}-options`} className={styles.sourceOptions} role="grid" aria-label={`${label}历史建议`} hidden={!open}>
      {options.map((source, index) => <div role="row" key={source}>
        <div id={`${id}-cell-${index}-0`} role="gridcell" aria-selected={index === active && column === 0} className={styles.sourceOption} onPointerDown={event => event.preventDefault()} onClick={() => choose(source)}>{source}</div>
        <div id={`${id}-cell-${index}-1`} role="gridcell" aria-selected={index === active && column === 1}><button type="button" aria-label={`移除来源建议 ${source}`} title="移除来源建议" disabled={disabled || busy} onPointerDown={event => event.preventDefault()} onClick={() => remove(source)}>×</button></div>
      </div>)}
      {!options.length && <div role="row"><div role="gridcell" className={styles.sourceEmpty}>{sources.length ? "没有匹配的来源。" : "暂无历史来源。"}</div></div>}
    </div>
    {error && <p role="alert" className={styles.entryError}>{error}</p>}
  </div>;
}
