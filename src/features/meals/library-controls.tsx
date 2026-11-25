"use client";

import { useRouter } from "next/navigation";
import type { Ref } from "react";
import { LocalLoading } from "@/components/local-loading";
import { RecordWorkspace } from "@/components/record-trend-panel";
import recordUI from "@/components/record-ui.module.css";
import styles from "./meals.module.css";

const categories = [["all", "全部"], ["meal", "整餐"], ["ingredient", "食材"]] as const;

export function FoodLibraryControls({ back, backRef, category = "all", select, query = "", search, add }: {
  back: () => void;
  backRef?: Ref<HTMLButtonElement>;
  category?: string;
  select?: (category: string) => void;
  query?: string;
  search?: (query: string) => void;
  add?: () => void;
}) {
  return <div className={styles.libraryControls}>
    <div className={styles.libraryNavigation}>
      <button ref={backRef} type="button" className={recordUI.textAction} onClick={back}>← 饮食</button>
      <div className={styles.categoryTabs} role="group" aria-label="食材库筛选">
        {categories.map(([value, label]) => <button key={value} type="button" className={recordUI.textAction}
          disabled={!select} aria-pressed={category === value} onClick={() => select?.(value)}>{label}</button>)}
      </div>
    </div>
    <div className={styles.librarySearch}>
      <input data-entry-input aria-label="搜索食材" placeholder="搜索食材" value={query} disabled={!search}
        onChange={event => search?.(event.target.value)}/>
      <button className={styles.primary} type="button" disabled={!add} onClick={add}>添加食材 ＋</button>
    </div>
  </div>;
}

export function FoodLibraryLoading() {
  const router = useRouter();
  function back() {
    const url = new URL(location.href);
    if (window.history.state?.formwardMealLibrary) {
      window.history.back();
    } else {
      url.searchParams.delete("section");
      router.replace(url.pathname + url.search);
    }
  }
  return <RecordWorkspace title="食材库" className={styles.workspace} data-workspace-reading aria-busy="true">
    <div className={styles.library}>
      <FoodLibraryControls back={back}/>
      <LocalLoading label="正在读取食材库…" onRetry={() => router.refresh()}/>
    </div>
  </RecordWorkspace>;
}
