"use client";

import { createContext, useCallback, useContext, useId, useState, type ComponentProps, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingLink } from "@/components/loading-link";
import { LocalLoading } from "@/components/local-loading";
import { AdminHeader } from "./header";
import { adminLocation, adminSections } from "./navigation";
import styles from "./console.module.css";

const TrackNavigation = createContext<((id: string, active: boolean) => void) | null>(null);
const NavigationPending = createContext(false);

export function AdminLink(props: ComponentProps<typeof LoadingLink>) {
  const track = useContext(TrackNavigation);
  const id = useId();
  const report = useCallback((active: boolean) => track?.(id, active), [id, track]);
  return <LoadingLink prefetch={false} {...props} onPendingChange={track ? report : undefined} />;
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<string | null>(null);
  const track = useCallback((id: string, active: boolean) => {
    setPending(current => active ? id : current === id ? null : current);
  }, []);
  return <TrackNavigation value={track}><NavigationPending value={pending !== null}>
    <div className={styles.shell} data-admin-workspace>
      <AdminHeader />
      <main className={styles.body}>
        <AdminNavigation />
        {children}
      </main>
    </div>
  </NavigationPending></TrackNavigation>;
}

function AdminNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = pathname.startsWith("/admin/users/") ? "users" : adminLocation({ tab: params.get("tab") ?? undefined }).tab;

  return <div className={styles.adminNavigation}>
    <nav className={styles.tabs} aria-label="管理后台栏目">
      {adminSections.map(([key, label]) =>
        <AdminLink key={key} href={"/admin?tab=" + key} className={styles.loadingTab} aria-current={tab === key ? "page" : undefined}>
          {label}
        </AdminLink>
      )}
    </nav>
    <AdminLink className={styles.securityNavigation} href="/admin?tab=security" aria-current={tab === "security" ? "page" : undefined}>
      安全与操作记录
    </AdminLink>
  </div>;
}

export function AdminHeading({ title, loading = false, refreshing = false, onRefresh }: {
  title: string;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const navigating = useContext(NavigationPending);
  const busy = loading || refreshing || navigating;
  return <div className={styles.heading} data-admin-heading>
    <h1>{title}</h1>
    <div className={styles.headingAction}>
      {(onRefresh || loading) && <button className={styles.secondary} disabled={busy} onClick={onRefresh}>刷新数据</button>}
      <LocalLoading active={busy} />
    </div>
  </div>;
}
