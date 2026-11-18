import type {AdminFilter} from "./account-management";
import styles from "./account.module.css";
/** 账号数据未知时，保留同一套搜索、邀请与列表槽位。 */
export function AdminListPlaceholder({tab="accounts",search="",status="all",page=1}:{tab?:AdminFilter["tab"];search?:string;status?:AdminFilter["status"];page?:number}){
 return <div aria-busy="true">
  {tab==="invitations"&&<form className={styles.inviteForm}><label className={styles.field}>邀请账号<input type="email" name="inviteEmail" placeholder="对方的登录邮箱" disabled/></label><button className={styles.primary} disabled>生成邀请链接</button><p className={styles.muted}>链接有效 72 小时，由你手动交给本人。对方自行设置密码。</p></form>}
  <form className={styles.filters}><label className={styles.field}><span className={styles.srOnly}>搜索登录邮箱</span><input name="search" placeholder="搜索登录邮箱" defaultValue={search} disabled/></label>{tab==="accounts"&&<label className={styles.field}><span className={styles.srOnly}>账号状态</span><select aria-label="账号状态" defaultValue={status} disabled><option value="all">全部状态</option><option value="active">正常</option><option value="banned">停用</option></select></label>}<button disabled>搜索</button></form>
  <div className={styles.listHeading}><span>{tab==="accounts"?"账号":tab==="invitations"?"邀请":"操作记录"}</span><small aria-hidden="true"/></div><div className={styles.list}></div>
  <div className={styles.pagination}><button disabled>上一页</button><span>第 {page} 页</span><button disabled>下一页</button></div>
 </div>;
}

export function AccountOperationsPlaceholder(){return <div aria-busy="true"><div className={styles.operation}><h3>帮助找回密码</h3><p className={styles.muted}>核实本人后生成 15 分钟有效的重设链接。</p><button disabled>生成密码重设链接</button></div><div className={styles.operation}><h3>撤销访问</h3><p className={styles.muted}>退出全部设备，并断开全部 AI 授权。</p><button disabled>撤销全部访问</button></div><form className={styles.operation}><h3>停用账号</h3><label className={styles.field}>停用原因<textarea aria-label="停用原因" rows={3} disabled/></label><button className={styles.danger} disabled>停用账号</button></form></div>;}
