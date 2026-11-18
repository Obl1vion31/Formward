"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminHeading } from "@/features/admin/navigation-view";
import styles from "@/features/admin/console.module.css";

export default function AdminError({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }
  return <>
    <AdminHeading title="管理数据读取未完成" refreshing={retrying} />
    <p className={styles.error} role="alert">暂时无法读取管理数据，请重试。</p>
    <button className={styles.secondary} disabled={retrying} onClick={retry}>重试</button>
  </>;
}
