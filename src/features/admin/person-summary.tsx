import {LoadingLink as Link} from "@/components/loading-link";
import {adminQuery,personHref} from "./navigation";
import type {AdminConsoleData} from "./queries";
import type {AdminFilter} from "./model";
import styles from "./console.module.css";
type Person=AdminConsoleData["users"][number];
function Placeholder(){return <span className={styles.placeholder} aria-label="正在读取"/>;}
function date(value:string|null){return value?new Date(value).toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai"}):"无";}
export function PersonHeading({person}:{person:Person|null}){return <div className={styles.personHeading}><h2>{person?person.email:<Placeholder/>}</h2><span>{person?`${person.membershipName} · ${person.banned?"账号停用":person.aiPaused||!person.membershipActive?"站内AI暂停":"正常"}`:<Placeholder/>}</span></div>;}
export function PersonSummary({person,id,filter,returnTo}:{person:Person|null;id:string;filter:AdminFilter;returnTo:string}){
 const override=person&&(person.aiPaused||person.aiDailyBudgetCents!==null||person.aiDailyRecognitionLimit!==null);
 const rows=[['会员档位',person?.membershipName],['每日AI额度',person?(person.dailyBudget===null?"无单独金额上限":`¥${person.dailyBudget}／日`):undefined],['每日识图次数',person?(person.dailyRecognitionLimit===null?"不限次数":`${person.dailyRecognitionLimit}次／日`):undefined],['个人覆盖',person?(override?"已设置":"继承档位默认"):undefined],['注册时间',person?date(person.createdAt):undefined],['最近登录',person?date(person.lastLoginAt):undefined]];
 return <div className={styles.profileOverview} data-user-summary><dl className={styles.profileFacts}>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??<Placeholder/>}</dd></div>)}</dl><nav className={styles.profileDestinations} aria-label="用户详情去向">
  <Link prefetch={false} href={personHref(id,"account",returnTo,filter)}><span><strong>账号设置</strong><small>分配档位、管理登录与账号状态</small></span><span aria-hidden="true">→</span></Link>
  <Link prefetch={false} href={"/admin?"+adminQuery({...filter,userId:id,page:1},"usage")}><span><strong>查看用量</strong><small>费用趋势、模型明细与记录数量</small></span><span aria-hidden="true">→</span></Link>
  <Link prefetch={false} href={personHref(id,"policy",returnTo,filter)}><span><strong>个人额度</strong><small>调整个人限制或恢复档位默认</small></span><span aria-hidden="true">→</span></Link>
 </nav></div>;
}
