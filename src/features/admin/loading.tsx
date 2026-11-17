import Link from "next/link";
import { AdminHeader } from "./header";
import { MembershipPlaceholder } from "./membership-form";
import styles from "./console.module.css";
import {normalizeAdminFilter} from "./model";
import {securityDay} from "../auth/security-time";
const sections=[["overview","总览"],["users","用户"],["tiers","档位"],["invitations","邀请"],["security","安全与操作记录"]];
/** 与真实页面共用尺寸；只占位未知数据，固定文字和导航从首帧可用。 */
export function AdminLoading({path="/admin"}:{path?:string}){
  const url=new URL(path,"https://local.test"),detail=url.pathname.includes("/users/"),tab=url.searchParams.get("tab")??"overview";
  const title=detail?"用户详情":sections.find(([key])=>key===tab)?.[1]??"总览";
  const query=url.searchParams;let dates:{from:string;to:string}|null=null;
  try{dates=normalizeAdminFilter({from:query.get("from")??undefined,to:query.get("to")??undefined});}catch{}
  const days=dates?Math.round((Date.parse(dates.to)-Date.parse(dates.from))/86400000)+1:0;
  const range=dates?.to===securityDay()&&[1,7,30,90].includes(days)?String(days):"0";
  const userId=query.get("userId")??"",provider=query.get("provider")??"",purpose=query.get("purpose")??"",sort=query.get("sort")??"cost";
  const rangeLabel=({"1":"今天","7":"近7天","30":"近30天","90":"近90天"}as Record<string,string>)[range]??"自定义";
  const back=query.get("returnTo"),backHref=back?.startsWith("/admin?")&&!back.includes("\\")?back:"/admin?tab=users";
  return <div className={styles.shell} aria-busy="true"><AdminHeader/><div className={styles.body}>
    {detail?<Link className={styles.back} href={backHref}>← 返回用户列表</Link>:<nav className={styles.tabs} aria-label="管理后台栏目">{sections.map(([key,label])=><Link href={"/admin?tab="+key} key={key} className={styles.loadingTab} aria-current={tab===key?"page":undefined}>{label}</Link>)}</nav>}
    <div className={styles.heading}><h1>{title}</h1><button disabled className={styles.secondary}>刷新数据</button></div>
    {detail&&<div className={styles.personHeading}><h2><span className={styles.placeholder} aria-label="正在读取用户"/></h2><span className={styles.placeholder} aria-label="正在读取用户状态"/></div>}
    {detail&&<MembershipPlaceholder/>}
    {(tab==="overview"||tab==="users")&&<><form className={styles.filters}><label>区间<select disabled defaultValue={range} aria-label="快捷日期区间"><option value={range}>{rangeLabel}</option></select></label><label>开始日期<input type="date" disabled defaultValue={dates?.from??""}/></label><label>结束日期<input type="date" disabled defaultValue={dates?.to??""}/></label>{!detail&&<label>用户<select aria-label="用户" disabled defaultValue={userId}><option value={userId}>{userId?"所选用户":"全部用户"}</option></select></label>}<label>模型<select aria-label="模型" disabled defaultValue={provider}><option value={provider}>{({qwen:"千问",mimo:"小米MiMo",glm:"智谱（历史）"}as Record<string,string>)[provider]??query.get("model")??"全部模型"}</option></select></label><label>用途<select aria-label="用途" disabled defaultValue={purpose}><option value={purpose}>{({chat:"聊天",meal_entry:"识图录入"}as Record<string,string>)[purpose]??"全部用途"}</option></select></label><button disabled>应用筛选</button></form><p className={styles.caption} role="status">正在读取统计 · 北京时间</p>
    <dl className={styles.ledger}>{["期间已结算模型成本","预占费用","未知费用占用","今日全站剩余／上限"].map((label,i)=><div key={label}><dt>{label}</dt><dd><span className={styles.placeholder} aria-label="读取中"/>{i===3&&<small>／¥10</small>}</dd></div>)}</dl><p className={styles.budgetNotice} data-state="pending">全站预算：<span className={`${styles.readCount} ${styles.placeholder}`}/></p><div className={styles.chartHeading}><div role="group" aria-label="趋势指标"><button className={styles.chosen} disabled>每日成本</button><button className={styles.textButton} disabled>模型请求</button><button className={styles.textButton} disabled>输出Token</button></div><small>悬停查看 · 点击展开当日明细</small></div><div className={styles.chart} aria-label="正在读取趋势"/>
    <dl className={styles.metrics}>{["AI任务","模型请求（含失败／中断）","输入Token","其中缓存命中","输出Token","使用AI的用户"].map(label=><div key={label}><dt>{label}</dt><dd><span className={styles.placeholder} aria-label="读取中"/></dd></div>)}</dl>
    <p className={styles.caption}>缺少完整用量的模型请求：<span className={`${styles.readCount} ${styles.placeholder}`}/>次；Token仅展示已知部分，未知不补零。</p>
    <p className={styles.caption}>识图：已使用<span className={`${styles.readCount} ${styles.placeholder}`}/>次 · 处理中<span className={`${styles.readCount} ${styles.placeholder}`}/>次 · 退回<span className={`${styles.readCount} ${styles.placeholder}`}/>次。业务API：{url.searchParams.get("provider")||url.searchParams.get("purpose")?"模型／用途筛选不适用于外部API计数。":<><span className={`${styles.readCount} ${styles.placeholder}`}/>次，其中失败<span className={`${styles.readCount} ${styles.placeholder}`}/>次；从本功能上线起记录。</>}</p>

    {detail&&<details className={styles.section}><summary>账号安全操作</summary></details>}
    <section className={styles.section}><h2>记录与图片</h2><p className={styles.caption}>仅统计当前有效记录。期间新增按成功保存时间，更新不会增加总数；模型筛选不改变记录存量。</p><dl className={styles.recordGrid}>{["餐次","实测身体记录","消耗记录日","运动记录","已完成训练","食材","训练计划","训练模板","已登记图片"].map(label=><div key={label}><dt>{label}</dt><dd><span className={styles.placeholder} aria-label="读取中"/><small>期间新增 <span className={`${styles.readCount} ${styles.placeholder}`} aria-label="读取中"/></small>{label==="已登记图片"&&<small>容量 <span className={`${styles.readCount} ${styles.placeholder}`} aria-label="读取中"/> MiB</small>}</dd></div>)}</dl></section>
    {!detail&&<><div className={styles.sectionHeading}><h2>用户用量</h2><span className={styles.placeholder} aria-label="正在读取用户数量"/></div><form className={styles.search}><label>搜索用户<input placeholder="邮箱或名称" defaultValue={query.get("search")??""} disabled/></label><label>排序<select aria-label="排序" disabled defaultValue={sort}><option value={sort}>{({cost:"期间成本",requests:"模型请求",records:"有效记录数",email:"邮箱"}as Record<string,string>)[sort]??"期间成本"}</option></select></label><button disabled>搜索</button></form><p className={styles.caption} role="status">正在读取用户列表…</p></>}</>}
    {tab==="tiers"&&<TierLoading/>}
    {(tab==="security"||tab==="invitations")&&<p role="status" className={styles.caption}>正在读取…</p>}
  </div></div>;
}

function TierLoading(){return <section data-tier-manager><div className={styles.tierIntro}><p className={styles.caption}>档位决定默认AI额度与权限。修改会统一影响对应用户，个人覆盖继续保留；全站每天仍共用¥10。</p><button disabled>新增档位</button></div><div className={styles.tierList}><div className={styles.tierListHead}><span>档位</span><span>默认额度与功能</span><span>用户</span><span/></div><p className={styles.empty} role="status">正在读取档位…</p></div></section>;}
