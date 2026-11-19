"use client";

import { createContext, useCallback, useContext, useId, useState, type ComponentProps, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingLink } from "@/components/loading-link";
import { useOrderedArrival } from "@/components/use-ordered-arrival";
import { LocalLoading } from "@/components/local-loading";
import { AdminHeader } from "./header";
import { adminLocation, adminSections, safeAdminReturn, type AdminTab } from "./navigation";
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
  const pathname = usePathname();
  const params = useSearchParams();
  const detail = pathname.startsWith("/admin/users/");
  const location = adminLocation({
    tab: params.get("tab") ?? undefined,
    section: params.get("section") ?? undefined,
    view: params.get("view") ?? undefined,
  });
  const back = detail ? safeAdminReturn(params.get("returnTo")) : undefined;
  const parent = new URLSearchParams(back?.slice("/admin?".length));
  const parentTab = detail ? adminLocation({ tab: parent.get("tab") ?? undefined }).tab : location.tab;
  const section = parentTab === "security" ? adminSections.length : adminSections.findIndex(([key]) => key === parentTab);
  const depth = detail ? (location.userView === "summary" ? 2 : 3) : Number(location.section === "invitations");
  const content = useOrderedArrival<HTMLDivElement>(section * 4 + depth, { distance: 12 });
  const [pending, setPending] = useState<string | null>(null);
  const track = useCallback((id: string, active: boolean) => {
    setPending(current => active ? id : current === id ? null : current);
  }, []);
  return <TrackNavigation value={track}><NavigationPending value={pending !== null}>
    <div className={styles.shell} data-admin-workspace>
      <AdminHeader />
      <main className={styles.body}>
        <AdminNavigation tab={detail ? "users" : location.tab}/>
        <div ref={content} data-admin-content>{children}</div>
      </main>
    </div>
  </NavigationPending></TrackNavigation>;
}

function AdminNavigation({tab}: {tab: AdminTab}) {
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
    <div className={styles.headingAction} data-initial={loading||undefined}>
      {(onRefresh || loading) && <button className={styles.secondary} disabled={busy} onClick={onRefresh}>刷新数据</button>}
      {loading
        ? <span className={styles.coldReading} data-admin-cold-reading role="status">正在读取…</span>
        : <LocalLoading active={busy} />}
    </div>
  </div>;
}
