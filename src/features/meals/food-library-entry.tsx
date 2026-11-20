"use client";

import { createContext, useContext, useMemo, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { WorkspaceRefreshingContext } from "@/features/dashboard/workspace-cache-context";
import styles from "./food-library-entry.module.css";

const EntrySlotContext = createContext<{
  node: HTMLDivElement | null;
  register: (node: HTMLDivElement | null) => void;
} | null>(null);

export function FoodLibraryEntryProvider({ children }: { children: ReactNode }) {
  const [node, register] = useState<HTMLDivElement | null>(null);
  const slot = useMemo(() => ({ node, register }), [node]);
  return <EntrySlotContext value={slot}>{children}</EntrySlotContext>;
}

function EntryButton({ onOpen, hidden, buttonRef, inline = false }: {
  onOpen?: () => void;
  hidden?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  inline?: boolean;
}) {
  return <button
    type="button"
    ref={buttonRef}
    className={inline ? styles.button + " " + styles.inlineButton : styles.button}
    aria-label="食材库"
    data-meal-library-entry={onOpen ? "ready" : "pending"}
    data-meal-library-placement={inline ? "date" : "edge"}
    disabled={!onOpen}
    hidden={hidden}
    onClick={onOpen}
  >
    {inline ? "食材库" : <span className={styles.face} aria-hidden="true"><span>食</span><span>材</span><span>库</span><span className={styles.arrow}>›</span></span>}
  </button>;
}

export function FoodLibraryDateEntry({ onOpen, buttonRef }: {
  onOpen?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const refreshing = useContext(WorkspaceRefreshingContext);
  return <EntryButton inline buttonRef={buttonRef} onOpen={refreshing ? undefined : onOpen}/>;
}

export function FoodLibraryEntryHost({ visible }: { visible: boolean }) {
  const slot = useContext(EntrySlotContext);
  return <div ref={slot?.register} className={styles.slot} data-meal-library-slot hidden={!visible}><EntryButton /></div>;
}

export function FoodLibraryEntry({ onOpen, hidden, buttonRef }: {
  onOpen: () => void;
  hidden: boolean;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const slot = useContext(EntrySlotContext);
  const refreshing = useContext(WorkspaceRefreshingContext);
  if (!slot?.node || refreshing) return null;
  return createPortal(<EntryButton onOpen={onOpen} hidden={hidden} buttonRef={buttonRef} />, slot.node);
}
