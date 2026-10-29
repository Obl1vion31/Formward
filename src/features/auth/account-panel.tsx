"use client";
import { useState, type FormEvent } from "react";
import { LoadingLink } from "@/components/loading-link";
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
export function AccountPanel({ initial }: { initial: PersonalAccountData }) {
  const [data, setData] = useState(initial), [oldPassword, setOldPassword] = useState(""), [newPassword, setNewPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [accessPassword, setAccessPassword] = useState("");
  const task = useAccountTask();
  // 完整导航清空已退出账号的客户端页面缓存。
  function signedOut() { window.location.replace("/"); }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) { task.setError("两次新密码不一致。"); return; }
    if (!await confirmAction({ title: "修改密码", message: "修改成功后会退出全部登录设备并断开 AI 授权，需要重新登录和连接。", confirmLabel: "修改并退出" })) return;
    const result = await task.run("正在修改密码…", () => changePersonalPasswordAction(oldPassword, newPassword));
    if (result?.ok) { setOldPassword(""); setNewPassword(""); setConfirmation(""); signedOut(); }
  }
  async function revokeDevice(id: string) {
    if (!await confirmAction({ title: "退出登录设备", message: id === data.currentSessionId ? "将退出当前设备。" : "将退出所选设备，其余设备保持登录。", confirmLabel: "退出设备" })) return;
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
    if (!await confirmAction({ title: "撤销全部访问", message: "将退出全部登录设备、断开全部 AI 授权，并使未使用的密码重设链接失效。", danger: true, confirmLabel: "撤销并退出" })) return;
    const result = await task.run("正在撤销访问…", () => revokePersonalAccessAction(accessPassword));
    if (result?.ok) { setAccessPassword(""); signedOut(); }
  }
  return <div className={styles.settings}><div className={styles.heading}><span className={styles.eyebrow}>YOUR ACCOUNT</span><h1>账号设置</h1><p className={styles.targetEmail}>{data.email}</p><p className={styles.muted}>{data.emailVerified ? "邮箱已验证" : "邮箱未验证"} · 当前作为登录标识使用</p></div>
    <AccountFeedback error={task.error} />
    <div className={styles.settingsGrid}>
    <div><section className={styles.section}><span className={styles.sectionNumber}>01 / 当前登录</span><h2>登录设备</h2><div className={styles.deviceList}>{data.devices.map(device => <article className={styles.device} key={device.id}><div><strong>{deviceName(device.userAgent)}</strong>{device.id === data.currentSessionId && <span className={styles.badge}>当前设备</span>}<small>登录于 {accountDate(device.createdAt)}</small></div><button type="button" disabled={task.busy} onClick={() => void revokeDevice(device.id)}>退出</button></article>)}</div></section>
    <section className={styles.section}><span className={styles.sectionNumber}>02 / 外部授权</span><h2>AI 接入</h2><p className={styles.muted}>查看连接中的 AI 助手，管理访问令牌和授权。</p><LoadingLink className={styles.inlineLink} href="/dashboard/ai">管理 AI 接入 <span aria-hidden="true">→</span></LoadingLink></section></div><section className={styles.section}><span className={styles.sectionNumber}>03 / 登录密码</span><h2>修改密码</h2><form onSubmit={changePassword}><label className={styles.field}>当前密码<input name="currentPassword" type="password" value={oldPassword} onChange={event => setOldPassword(event.target.value)} required maxLength={128} autoComplete="current-password" disabled={task.busy} /></label><label className={styles.field}>新密码<input name="newPassword" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" disabled={task.busy} /></label><label className={styles.field}>确认新密码<input name="confirmPassword" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" disabled={task.busy} /></label><p className={styles.muted}>12–128 个字符，可以粘贴密码管理器生成的密码。</p><button type="submit" className={styles.primary} disabled={task.busy}>修改密码</button></form></section></div>
    <section className={`${styles.section} ${styles.accessSection}`}><div><span className={styles.sectionNumber}>04 / 访问控制</span><h2>撤销全部访问</h2><p className={styles.muted}>退出全部设备并断开 AI 授权。记录保留，之后可重新登录。</p></div><form onSubmit={revokeAll}><label className={styles.field}>再次输入当前密码<input type="password" name="accessPassword" value={accessPassword} onChange={event => setAccessPassword(event.target.value)} required maxLength={128} autoComplete="current-password" disabled={task.busy} /></label><button type="submit" className={styles.danger} disabled={task.busy}>撤销全部访问</button></form></section>
  </div>;
}
