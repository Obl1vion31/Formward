"use client";
import { WorkspaceReturnLink } from "@/components/workspace-return";
import {LocalLoading} from "@/components/local-loading";
import { MfaPanel } from "./mfa-panel";
import {useDraftGuard} from "@/components/draft-guard";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, PASSWORD_LENGTH_LABEL } from "./password-policy";
import { useState, type FormEvent } from "react";
import { confirmAction } from "@/components/confirmation-state";
import { changePersonalPasswordAction, loadPersonalAccountAction, revokePersonalAccessAction, revokePersonalSessionAction } from "@/app/dashboard/account/actions";
import type { PersonalAccountData } from "./account-management";
import { AccountFeedback, accountDate, useAccountTask } from "./account-ui";
import styles from "./account.module.css";

function deviceName(agent: string | null) {
  if (!agent) return "浏览器设备";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "浏览器";
  const system = /iPhone|iPad/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android" : /Windows/.test(agent) ? "Windows" : /Macintosh/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "设备";
  return `${browser} · ${system}`;
}
export function AccountPanel({ initial,embedded=false }: { initial: PersonalAccountData;embedded?:boolean }) {
  const [data, setData] = useState(initial), [oldPassword, setOldPassword] = useState(""), [newPassword, setNewPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [accessPassword, setAccessPassword] = useState("");
  const task = useAccountTask();
  useDraftGuard(!!(oldPassword||newPassword||confirmation||accessPassword),task.busy);
  // 完整导航清空已退出账号的客户端页面缓存。
  function signedOut() { window.location.replace("/"); }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) { task.setError("两次新密码不一致。"); return; }
    if (!await confirmAction({ title: "修改 " + data.email + " 的密码", message: "全部设备将退出登录，AI 授权失效，设备同步暂停。历史记录保留。", confirmLabel: "修改并退出" })) return;
    const result = await task.run("正在修改密码…", () => changePersonalPasswordAction(oldPassword, newPassword));
    if (result?.ok) { setOldPassword(""); setNewPassword(""); setConfirmation(""); signedOut(); }
  }
  async function revokeDevice(id: string) {
    const device=data.devices.find(item=>item.id===id);
    if (!device||!await confirmAction({ title: "退出 " + deviceName(device.userAgent), message: data.email + " 将在该设备上退出登录。历史记录和 AI 授权保留。", confirmLabel: "退出设备" })) return;
    await task.run("正在退出设备…", async () => {
      const result = await revokePersonalSessionAction(id);
      if (!result.ok) return result;
      if (result.data.signedOut) signedOut();
      else { const latest = await loadPersonalAccountAction(); if (latest.ok) setData(latest.data); else return latest; }
      return result;
    });
  }
  async function revokeAll(event: FormEvent) {
    event.preventDefault();
    if (!await confirmAction({ title: "撤销 " + data.email + " 的全部访问", message: "全部设备将退出登录，AI 授权和未使用的重设链接失效，设备同步暂停。历史记录保留。", danger: true, confirmLabel: "撤销并退出" })) return;
    const result = await task.run("正在撤销访问…", () => revokePersonalAccessAction(accessPassword));
    if (result?.ok) { setAccessPassword(""); signedOut(); }
  }
  return <div className={styles.settings}><div className={styles.heading}>{!embedded&&<><WorkspaceReturnLink/><h1>账号设置</h1></>}<p className={styles.targetEmail}>{data.email}</p><p className={styles.muted}>{data.emailVerified ? "邮箱已验证" : "邮箱未验证"} · 当前作为登录标识使用</p></div>
    {task.busy&&<LocalLoading label={task.label}/>}<AccountFeedback error={task.error} />
    <div className={styles.settingsGrid}>
    <div><section className={styles.section}><h2>登录设备</h2><div className={styles.deviceList}>{data.devices.map(device => <article className={styles.device} key={device.id}><div><strong>{deviceName(device.userAgent)}</strong>{device.id === data.currentSessionId && <span className={styles.badge}>当前设备</span>}<small>登录于 {accountDate(device.createdAt)}</small></div><button type="button" disabled={task.busy} onClick={() => void revokeDevice(device.id)}>退出</button></article>)}</div></section>
    </div><section className={styles.section}><h2>修改密码</h2><form onSubmit={changePassword}><label className={styles.field}>当前密码<input name="currentPassword" type="password" value={oldPassword} onChange={event => setOldPassword(event.target.value)} required maxLength={128} autoComplete="current-password" disabled={task.busy} /></label><label className={styles.field}>新密码<input name="newPassword" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} autoComplete="new-password" disabled={task.busy} /></label><label className={styles.field}>确认新密码<input name="confirmPassword" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} autoComplete="new-password" disabled={task.busy} /></label><p className={styles.muted}>{PASSWORD_LENGTH_LABEL}，可以粘贴密码管理器生成的密码。</p><button type="submit" className={styles.primary} disabled={task.busy}>修改密码</button></form></section></div>
    <section className={`${styles.section} ${styles.accessSection}`}><div><h2>撤销全部访问</h2><p className={styles.muted}>退出全部设备、断开 AI 授权并暂停设备同步。记录保留，之后可重新登录。</p></div><form onSubmit={revokeAll}><label className={styles.field}>再次输入当前密码<input type="password" name="accessPassword" value={accessPassword} onChange={event => setAccessPassword(event.target.value)} required maxLength={128} autoComplete="current-password" disabled={task.busy} /></label><button type="submit" className={styles.danger} disabled={task.busy}>撤销全部访问</button></form></section>
    <MfaPanel embedded />
  </div>;
}
