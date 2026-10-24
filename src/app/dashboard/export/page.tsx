import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { DashboardHeader } from "../header";
import styles from "./page.module.css";
export const metadata = { title: "Formward · 导出记录", referrer: "no-referrer" as const };
export default async function ExportPage() {
  const user = await currentPageUser(); if (!user) redirect("/");
  return <main className="dashboard-page"><DashboardHeader email={user.email}/><section className={styles.workspace}><h1>导出记录</h1><p>下载自己的饮食、身体与消耗记录，保存为 Excel。</p><form action="/dashboard/export/file" method="get" className={styles.form}>
    <div className={styles.range}><label>开始日期<input type="date" name="from"/></label><label>结束日期<input type="date" name="to"/></label></div><p className={styles.hint}>留空下载全部有效记录；食材库和公式资料始终完整导出。</p><button type="submit">下载 Excel · .xlsx</button></form><details className={styles.details}><summary>文件包含什么</summary><p>每日汇总、餐次、食物明细、身体记录、每日消耗、活动明细、食材库与公式资料。保留日期、单位、来源、实测／估计，未知留空、0正常保存。</p><p>不包含已删除记录、账号凭据或访问令牌。图片仅保留数量和内部标识，不包含原图；Excel不替代照片或数据库完整备份。</p></details></section></main>;
}
