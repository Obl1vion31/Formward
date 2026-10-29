"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Inspector } from "@/components/inspector";
import { confirmAction } from "@/components/confirmation-state";
import { inviteAccountAction, loadAdminAction, manageAccountAction, revokeInvitationAction, unlockAdminAction } from "@/app/admin/actions";
import type { AccountCommand, AdminData, AdminFilter } from "./account-management";
import { AccountFeedback, AccountFrame, SecretAccountLink, accountDate, useAccountTask } from "./account-ui";
import styles from "./account.module.css";

type UserRow = Extract<AdminData["rows"][number], { banned: boolean }>;
const actionNames: Record<string, string> = { admin_unlock: "验证管理身份", invite_created: "生成邀请", invite_revoked: "撤销邀请", invite_claimed: "账号激活", reset_created: "生成重设链接", reset_password: "生成重设链接", password_reset: "重设密码", password_changed: "修改密码", suspend: "停用账号", restore: "恢复账号", revoke_access: "撤销全部访问", session_revoked: "退出登录设备", owner_initialized: "初始化管理权限", owner_recovered: "本地恢复密码" };
const tabs = [["accounts", "账号"], ["invitations", "邀请"], ["events", "操作记录"]] as const;

export function AdminPanel({ email, initial }: { email: string; initial: AdminData | null }) {
  const [data, setData] = useState(initial), [locked, setLocked] = useState(!initial), [password, setPassword] = useState("");
  const [filter, setFilter] = useState<AdminFilter>({ tab: "accounts", search: "", status: "all", page: 1 });
  const [search, setSearch] = useState(""), [inviteEmail, setInviteEmail] = useState(""), [notice, setNotice] = useState("");
  const [target, setTarget] = useState<UserRow | null>(null), [reason, setReason] = useState("");
  const [secret, setSecret] = useState<{ url: string; expiresAt: string } | null>(null), task = useAccountTask();
  const [now, setNow] = useState(0);
  useEffect(() => { const update = () => setNow(Date.now()); update(); const timer = setInterval(update, 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!data || locked) return;
    const timer = setTimeout(() => setLocked(true), Math.max(0, new Date(data.verifiedUntil).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [data, locked]);
  function failed(result: { ok: boolean; code?: string } | null) {
    if (result && !result.ok && result.code === "verification_required") setLocked(true);
  }
  async function reload(next: AdminFilter) {
    const result = await loadAdminAction(next);
    if (result.ok) { setData(result.data); setFilter(next); setLocked(false); }
    else { task.setError(result.error); failed(result); }
    return result;
  }
  async function load(next: AdminFilter) { await task.run("正在读取账号…", () => reload(next)); }
  async function unlock(event: FormEvent) {
    event.preventDefault();
    const result = await task.run("正在验证管理身份…", async () => {
      const unlocked = await unlockAdminAction(password);
      if (!unlocked.ok) return unlocked;
      setPassword("");
      return reload(filter);
    }); failed(result);
  }
  function reveal(result: { url: string | null; expiresAt: string; repeated: boolean } | null) {
    if (result?.url) setSecret({ url: result.url, expiresAt: result.expiresAt });
    else if (result?.repeated) setNotice("此请求已完成。链接不会再次显示；如未保存，请重新生成。");
  }
  async function invite(event?: FormEvent, address = inviteEmail) {
    event?.preventDefault();
    const result = await task.run("正在生成邀请…", async () => {
      const created = await inviteAccountAction(address, crypto.randomUUID());
      if (created.ok) { reveal(created.data); setInviteEmail(""); await reload(filter); }
      return created;
    }); failed(result);
  }
  async function operate(command: AccountCommand) {
    if (!target || task.busy) return;
    const messages: Record<AccountCommand, string> = {
      suspend: "停用后，此账号将退出全部设备，AI 授权和未使用的重设链接会失效。健康记录保留。",
      restore: "恢复后可重新登录。旧会话、旧链接和旧 AI 授权保持失效。",
      revoke_access: "此账号将退出全部设备，并断开 AI 授权及作废未使用的重设链接。",
      reset_password: "请先通过原联系渠道核实本人。链接有效 15 分钟，成功重设后将退出全部设备并断开 AI 授权。",
    };
    if (command === "suspend" && !reason.trim()) { task.setError("请填写停用原因。"); return; }
    if (!await confirmAction({ title: command === "reset_password" ? "生成密码重设链接" : actionNames[command], message: `${target.email}：${messages[command]}`, danger: command === "suspend" || command === "revoke_access", confirmLabel: "确认" })) return;
    const result = await task.run("正在处理账号…", async () => {
      const changed = await manageAccountAction(target.id, command, reason, crypto.randomUUID());
      if (changed.ok) { reveal(changed.data); setTarget(null); setReason(""); setNotice(command === "reset_password" ? "重设链接已生成，账号密码尚未改变。" : "账号操作已完成。"); await reload(filter); }
      return changed;
    }); failed(result);
  }
  async function revokeInvitation(id: string, address: string) {
    if (!await confirmAction({ title: "撤销邀请", message: `撤销 ${address} 的邀请后，原链接将立即失效。`, confirmLabel: "撤销", danger: true })) return;
    const result = await task.run("正在撤销邀请…", async () => {
      const changed = await revokeInvitationAction(id, crypto.randomUUID());
      if (changed.ok) { setNotice("邀请已撤销。"); await reload(filter); }
      return changed;
    }); failed(result);
  }
  return <AccountFrame title="账号管理" intro="邀请用户、管理访问，所有操作留有记录。">
    <div className={styles.accountIdentity}><span>{email}</span><span className={styles.badge}>管理者</span></div>
    <AccountFeedback error={task.error} message={notice} />
    {locked ? <section className={styles.unlock} aria-label="管理身份验证"><span className={styles.sectionNumber}>01 / 身份验证</span><h2>输入密码以继续管理</h2><p className={styles.muted}>验证仅对当前设备有效，10 分钟后需要再次确认。</p><form onSubmit={unlock}><label className={styles.field}>当前密码<input name="adminPassword" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required maxLength={128} disabled={task.busy} /></label><button type="submit" className={styles.primary} disabled={task.busy}>{task.busy ? "正在验证…" : "验证并进入"}</button></form></section> : <>
      <nav className={styles.tabs} aria-label="账号管理栏目">{tabs.map(([tab, label]) => <button type="button" key={tab} aria-current={filter.tab === tab ? "page" : undefined} disabled={task.busy} onClick={() => void load({ ...filter, tab, page: 1 })}>{label}</button>)}</nav>
      {filter.tab === "invitations" && <form className={styles.inviteForm} onSubmit={event => void invite(event)}><label className={styles.field}>邀请账号<input type="email" name="inviteEmail" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="对方的登录邮箱" required maxLength={254} autoComplete="off" disabled={task.busy} /></label><button type="submit" className={styles.primary} disabled={task.busy}>生成邀请链接</button><p className={styles.muted}>链接有效 72 小时，由你手动交给本人。对方自行设置密码。</p></form>}
      <form className={styles.filters} onSubmit={event => { event.preventDefault(); void load({ ...filter, search, page: 1 }); }}><label className={styles.field}><span className={styles.srOnly}>搜索登录邮箱</span><input name="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索登录邮箱" maxLength={254} disabled={task.busy} /></label>{filter.tab === "accounts" && <label className={styles.field}><span className={styles.srOnly}>账号状态</span><select value={filter.status} onChange={event => void load({ ...filter, search, status: event.target.value as AdminFilter["status"], page: 1 })} disabled={task.busy}><option value="all">全部状态</option><option value="active">正常</option><option value="banned">停用</option></select></label>}<button type="submit" disabled={task.busy}>搜索</button></form>
      <div className={styles.listHeading}><span>{tabs.find(([tab]) => tab === filter.tab)?.[1]}</span><small>共 {data?.total ?? 0} 条</small></div>
      <div className={styles.list} aria-live="polite">{!data?.rows.length && <p className={styles.empty}>暂无匹配记录。</p>}{data?.rows.map(row => {
        if ("banned" in row) return <article key={row.id} className={styles.row}><div className={styles.rowMain}><strong>{row.email}</strong><span className={row.banned ? styles.disabledBadge : styles.badge}>{row.role === "owner" ? "管理者" : row.banned ? "已停用" : "正常"}</span>{row.banReason && <small>{row.banReason}</small>}</div><div className={styles.rowMeta}><small>注册时间</small><span>{accountDate(row.createdAt)}</span></div><div className={styles.rowMeta}><small>最近登录</small><span>{accountDate(row.lastLoginAt)}</span></div><div className={styles.rowActions}>{row.role === "user" && <button type="button" disabled={task.busy} onClick={() => { setTarget(row); setReason(""); task.setError(""); }}>管理</button>}</div></article>;
        if ("expiresAt" in row) {
          const status = row.consumedAt ? "已激活" : row.revokedAt ? "已撤销" : new Date(row.expiresAt).getTime() <= now ? "已过期" : "待激活";
          return <article key={row.id} className={styles.row}><div className={styles.rowMain}><strong>{row.email}</strong><span className={styles.badge}>{status}</span></div><div className={styles.rowMeta}><small>生成时间</small><span>{accountDate(row.createdAt)}</span></div><div className={styles.rowMeta}><small>有效至</small><span>{accountDate(row.expiresAt)}</span></div><div className={styles.rowActions}>{!row.consumedAt && <><button type="button" disabled={task.busy} onClick={async () => { if (await confirmAction({ title: "重新生成邀请", message: `为 ${row.email} 生成新邀请，旧邀请将失效。`, confirmLabel: "生成新链接" })) void invite(undefined, row.email); }}>重新生成</button>{status === "待激活" && <button type="button" disabled={task.busy} onClick={() => void revokeInvitation(row.id, row.email)}>撤销</button>}</>}</div></article>;
        }
        return <article key={row.id} className={styles.eventRow}><div className={styles.rowMain}><strong>{actionNames[row.action] ?? row.action}</strong><span>{row.email}</span>{row.reason && <small>{row.reason}</small>}</div><div className={styles.rowMeta}><small>操作者</small><span>{row.actorEmail ?? "本地维护"}</span></div><div className={styles.rowMeta}><small>{row.outcome === "success" ? "成功" : "未完成"}</small><span>{accountDate(row.createdAt)}</span></div></article>;
      })}</div>
      <div className={styles.pagination}><button type="button" disabled={task.busy || (filter.page ?? 1) <= 1} onClick={() => void load({ ...filter, page: (filter.page ?? 1) - 1 })}>上一页</button><span>第 {data?.page ?? 1} 页</span><button type="button" disabled={task.busy || (data?.page ?? 1) * 50 >= (data?.total ?? 0)} onClick={() => void load({ ...filter, page: (filter.page ?? 1) + 1 })}>下一页</button></div>
    </>}
    {!locked && target && <Inspector title="管理账号" busy={task.busy} close={() => { if (!task.busy) setTarget(null); }} className={styles.dialog} header={<div className={styles.dialogHeader}><h2>管理账号</h2><button type="button" aria-label="关闭账号管理" disabled={task.busy} onClick={() => setTarget(null)}>×</button></div>}><p className={styles.targetEmail}>{target.email}</p><AccountFeedback error={task.error} />{target.banned ? <><p className={styles.muted}>停用原因：{target.banReason}</p><button type="button" className={styles.primary} disabled={task.busy} onClick={() => void operate("restore")}>恢复账号</button></> : <><div className={styles.operation}><h3>帮助找回密码</h3><p className={styles.muted}>核实本人后生成 15 分钟有效的重设链接。</p><button type="button" disabled={task.busy} onClick={() => void operate("reset_password")}>生成密码重设链接</button></div><div className={styles.operation}><h3>撤销访问</h3><p className={styles.muted}>退出全部设备，并断开全部 AI 授权。</p><button type="button" disabled={task.busy} onClick={() => void operate("revoke_access")}>撤销全部访问</button></div><form className={styles.operation} onSubmit={event => { event.preventDefault(); void operate("suspend"); }}><h3>停用账号</h3><label className={styles.field}>停用原因<textarea name="reason" value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={500} required disabled={task.busy} /></label><button type="submit" className={styles.danger} disabled={task.busy}>停用账号</button></form></>}</Inspector>}
    {!locked && secret && <SecretAccountLink {...secret} close={() => setSecret(null)} />}
  </AccountFrame>;
}
