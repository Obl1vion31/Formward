"use client";
import {createContext, useCallback, useContext, useId, useRef, useState, type ReactNode} from "react";
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
  return <InformationContext value={open}>{children}{openPath === pathname && <Inspector compact fitContent title="更多信息" closeLabel="关闭更多信息" close={() => setOpenPath(null)}><AppInformationContent/></Inspector>}</InformationContext>;
}
type InformationSection = "version" | "changes" | "filing" | "contact";
function AppInformationContent() {
  const update = useAppUpdate(), id = useId();
  const [expanded, setExpanded] = useState<InformationSection | null>(null);
  const [feedback, setFeedback] = useState<{section: InformationSection; message: string; fallback?: string} | null>(null);
  const refreshLock = useRef(false);
  const versionInfo = `${info.name} ${info.productVersion}\n构建版本：${currentBuild}`;
  function toggle(section: InformationSection) {setExpanded(current => current === section ? null : section); setFeedback(null);}
  async function copy(value: string, label: string, section: InformationSection) {
    try {await navigator.clipboard.writeText(value); setFeedback({section, message: `${label}已复制。`});}
    catch {setFeedback({section, message: `暂时无法复制${label}，可以选择下方文字手动复制。`, fallback: value});}
  }
  async function refresh() {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      const result = await refreshToAppUpdate();
      setFeedback(result === "busy" ? {section: "version", message: "当前操作正在进行，完成后再刷新。"} : null);
    } finally {refreshLock.current = false;}
  }
  const status = {idle: "", checking: "正在检查更新…", latest: "已是最新版本", available: "有新版本可用", error: update.availableVersion ? "上次已发现更新，本次检查失败，请重试。" : "暂时无法检查更新，请重试。"}[update.status];
  const disclosure = (section: InformationSection, title: string, children: ReactNode, value?: string) => <section className={styles.disclosure}>
    <h3><button type="button" className={styles.row} aria-expanded={expanded === section} aria-controls={`${id}-${section}`} onClick={() => toggle(section)}><span>{title}</span>{value && <span className={styles.rowValue}>{value}</span>}<Chevron/></button></h3>
    <div id={`${id}-${section}`} className={styles.details} hidden={expanded !== section}>{children}{feedback?.section === section && <><p className={styles.feedback} role="status">{feedback.message}</p>{feedback.fallback && <pre className={styles.copyFallback} tabIndex={0}>{feedback.fallback}</pre>}</>}</div>
  </section>;
  return <div className={styles.information} data-app-information>
    <div className={styles.group}>
      {disclosure("version", "版本与更新", <>
        <p className={styles.updateStatus} role="status" aria-live="polite">{status}</p>
        {update.availableVersion ? <button type="button" className={styles.primary} onClick={() => void refresh()}>刷新到新版本</button> : <button type="button" className={styles.check} disabled={update.status === "checking"} aria-busy={update.status === "checking"} onClick={() => void checkForAppUpdate()}>检查更新</button>}
        <div className={styles.secondaryActions}><button type="button" onClick={() => void copy(versionInfo, "版本信息", "version")}>复制版本信息</button>{update.availableVersion && <button type="button" disabled={update.status === "checking"} onClick={() => void checkForAppUpdate()}>重新检查</button>}</div>
      </>, `v${info.productVersion}`)}
      {disclosure("changes", "更新说明", <ul className={styles.changeList}>{recentChanges.map(change => <li key={change}>{change}</li>)}</ul>)}
    </div>
    <div className={styles.group}>
      {disclosure("filing", "备案信息", <dl className={styles.filing}><div><dt>ICP备案号</dt><dd><a href={info.icpUrl} target="_blank" rel="noopener noreferrer">{info.icpNumber}<External/></a></dd></div><div><dt>官方网站</dt><dd><a href={info.website} target="_blank" rel="noopener noreferrer">{new URL(info.website).host}<External/></a></dd></div></dl>)}
      {disclosure("contact", "联系我们", <><p className={styles.address}>{info.email}</p><a className={styles.check} href={`mailto:${info.email}?subject=Formward%20使用反馈`}>邮件联系<External/></a><div className={styles.secondaryActions}><button type="button" onClick={() => void copy(info.email, "邮箱", "contact")}>复制邮箱</button></div></>)}
      <a className={styles.row} href={info.helpUrl} target="_blank" rel="noopener noreferrer"><span>使用帮助</span><External/></a>
    </div>
    <nav className={styles.group} aria-label="隐私与条款"><a className={styles.row} href={info.privacyUrl} target="_blank" rel="noopener noreferrer"><span>隐私政策</span><External/></a><a className={styles.row} href={info.termsUrl} target="_blank" rel="noopener noreferrer"><span>服务条款</span><External/></a></nav>
  </div>;
}
function Chevron() {return <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m2 5 6 6 6-6"/></svg>;}
function External() {return <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 3h4v4M13 3 7 9M7 3H3v10h10V9"/></svg>;}
