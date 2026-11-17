import type {AdminFilter} from "./account-management";
import styles from "./account.module.css";
/** 账号数据未知时，保留同一套搜索、邀请与列表槽位。 */
export function AdminListPlaceholder({tab="accounts",search="",status="all",page=1}:{tab?:AdminFilter["tab"];search?:string;status?:AdminFilter["status"];page?:number}){
 return <div aria-busy="true">
  {tab==="invitations"&&<form className={styles.inviteForm}><label className={styles.field}>邀请账号<input type="email" name="inviteEmail" placeholder="对方的登录邮箱" disabled/></label><button className={styles.primary} disabled>生成邀请链接</button><p className={styles.muted}>链接有效 72 小时，由你手动交给本人。对方自行设置密码。</p></form>}
  <form className={styles.filters}><label className={styles.field}><span className={styles.srOnly}>搜索登录邮箱</span><input name="search" placeholder="搜索登录邮箱" defaultValue={search} disabled/></label>{tab==="accounts"&&<label className={styles.field}><span className={styles.srOnly}>账号状态</span><select aria-label="账号状态" defaultValue={status} disabled><option value="all">全部状态</option><option value="active">正常</option><option value="banned">停用</option></select></label>}<button disabled>搜索</button></form>
  <div className={styles.listHeading}><span>{tab==="accounts"?"账号":tab==="invitations"?"邀请":"操作记录"}</span><small>正在读取数量</small></div><div className={styles.list}><p className={styles.empty} role="status">正在读取{tab==="accounts"?"账号":tab==="invitations"?"邀请":"操作记录"}…</p></div>
  <div className={styles.pagination}><button disabled>上一页</button><span>第 {page} 页</span><button disabled>下一页</button></div>
 </div>;
}
