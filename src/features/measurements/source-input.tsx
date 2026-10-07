"use client";

import { useId, useState } from "react";
import styles from "./measurements-view.module.css";

/** 自由输入与本账号历史建议；焦点留在输入框，选项通过 active-descendant 导航。 */
export function SourceInput({ label, value, sources, onChange }: { label: string; value: string; sources: string[]; onChange: (value: string) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const options = sources.filter(source => source.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
  const visible = open && options.length > 0;
  function choose(source: string) { onChange(source); setOpen(false); setActive(-1); }
  return <div className={styles.sourceInput}>
    <label htmlFor={id}>{label}<small>实测必填</small></label>
    <input id={id} role="combobox" aria-label={label} autoComplete="off" maxLength={300} placeholder="输入或选择来源" value={value}
      aria-autocomplete="list" aria-expanded={visible} aria-controls={`${id}-options`} aria-activedescendant={visible && active >= 0 && active < options.length ? `${id}-option-${active}` : undefined}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          if (options.length) {
            const next = event.key === "ArrowDown" ? (active + 1) % options.length : active <= 0 ? options.length - 1 : active - 1;
            setActive(next);
            requestAnimationFrame(() => document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: "nearest" }));
          }
        }
        if (event.key === "Enter" && visible && active >= 0 && options[active]) { event.preventDefault(); choose(options[active]); }
      }} />
    <ul id={`${id}-options`} role="listbox" aria-label={`${label}历史建议`} hidden={!visible}>
      {options.map((source, index) => <li id={`${id}-option-${index}`} key={source} role="option" aria-selected={index === active}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(source)}>{source}</li>)}
    </ul>
  </div>;
}
