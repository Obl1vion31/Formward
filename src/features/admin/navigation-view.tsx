import { LoadingLink } from "@/components/loading-link";
import { adminSections,type AdminTab } from "./navigation";
import styles from "./console.module.css";

export function AdminNavigation({tab}:{tab:AdminTab}) {return <div className={styles.adminNavigation}><nav className={styles.tabs} aria-label="管理后台栏目">{adminSections.map(([key,label])=><LoadingLink prefetch={false} key={key} href={`/admin?tab=${key}`} className={styles.loadingTab} aria-current={tab===key?"page":undefined}>{label}</LoadingLink>)}</nav><LoadingLink prefetch={false} className={styles.securityNavigation} href="/admin?tab=security" aria-current={tab==="security"?"page":undefined}>安全与操作记录</LoadingLink></div>;}
