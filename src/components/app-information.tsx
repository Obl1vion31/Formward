"use client";
import {createContext, useCallback, useContext, useRef, useState, type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {Inspector} from "./inspector";
import {appInformation as info, recentChanges} from "./app-information-content";
import {checkForAppUpdate, currentBuild, refreshToAppUpdate, useAppUpdate} from "./app-update-state";
import styles from "./app-information.module.css";

const InformationContext = createContext<(() => void) | null>(null);
export function useAppInformation() {
  const open = useContext(InformationContext);
  if (!open) throw new Error("AppInformationProvider missing");
  return open;
}
export function AppInformationProvider({children}: {children: ReactNode}) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = useCallback(() => setOpenPath(pathname), [pathname]);
  return <InformationContext value={open}>{children}{openPath === pathname && <Inspector compact stableScroll title="更多信息" closeLabel="关闭更多信息" close={() => setOpenPath(null)}><AppInformationContent/></Inspector>}</InformationContext>;
}
function AppInformationContent() {
  const update = useAppUpdate();
  const [feedback, setFeedback] = useState("");
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  const refreshLock = useRef(false);
  const versionInfo = `${info.name} ${info.productVersion}\n构建版本：${currentBuild}`;
  async function copy(value: string, label: string) {
    try {await navigator.clipboard.writeText(value); setCopyFailed(null); setFeedback(`${label}已复制。`);}
    catch {setCopyFailed(value); setFeedback(`暂时无法复制${label}，可以选择下方文字手动复制。`);}
  }
  async function refresh() {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      const result = await refreshToAppUpdate();
      setFeedback(result === "busy" ? "当前操作正在进行，完成后再刷新。" : "");
    } finally {refreshLock.current = false;}
  }
  const status = {idle: "尚未检查更新", checking: "正在检查更新…", latest: "已是最新版本", available: "有新版本可用", error: "暂时无法检查更新，请重试。"}[update.status];
  return <div className={styles.information}>
    <section aria-labelledby="app-information-version">
      <div className={styles.versionRow}><h3 id="app-information-version">当前版本 <span>v{info.productVersion}</span></h3><button type="button" disabled={update.status === "checking"} onClick={() => void checkForAppUpdate()}>检查更新</button></div>
      <p className={styles.updateStatus} role="status" aria-live="polite">{status}</p>
      <div className={styles.actions}>{update.availableVersion && <button type="button" className={styles.primary} onClick={() => void refresh()}>刷新到新版本</button>}<button type="button" onClick={() => void copy(versionInfo, "版本信息")}>复制版本信息</button></div>
      <details className={styles.changes}><summary>更新说明<Chevron/></summary><ul>{recentChanges.map(change => <li key={change}>{change}</li>)}</ul></details>
    </section>
    <section aria-labelledby="app-information-filing"><h3 id="app-information-filing">备案信息</h3><a className={styles.link} href={info.icpUrl} target="_blank" rel="noopener noreferrer">{info.icpNumber}<External/></a><a className={styles.secondaryLink} href={info.website} target="_blank" rel="noopener noreferrer">{new URL(info.website).host}<External/></a></section>
    <section aria-labelledby="app-information-contact"><h3 id="app-information-contact">联系与反馈</h3><a className={styles.link} href={`mailto:${info.email}?subject=Formward%20使用反馈`}>{info.email}<External/></a><button type="button" className={styles.textButton} onClick={() => void copy(info.email, "邮箱")}>复制邮箱</button></section>
    <nav className={styles.links} aria-label="帮助与协议"><a href={info.helpUrl} target="_blank" rel="noopener noreferrer">使用帮助<External/></a><a href={info.privacyUrl} target="_blank" rel="noopener noreferrer">隐私政策<External/></a><a href={info.termsUrl} target="_blank" rel="noopener noreferrer">服务条款<External/></a></nav>
    <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>{copyFailed && <pre className={styles.copyFallback} tabIndex={0}>{copyFailed}</pre>}
  </div>;
}
function Chevron() {return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>;}
function External() {return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 3h4v4M13 3 7 9M7 3H3v10h10V9"/></svg>;}
