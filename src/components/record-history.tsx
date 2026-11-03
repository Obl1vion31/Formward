"use client";
import {useState,type ReactNode} from "react";
import styles from "./record-ui.module.css";
/** 页面内日期索引；查看和编辑交给各页的单日 Inspector。 */
export function RecordHistory({today,dates,renderRow,view}:{today:string;dates:string[];renderRow:(date:string)=>ReactNode;view:(date:string)=>void}){
 const [limit,setLimit]=useState(50),[selected,setSelected]=useState("");
 return <><form className={styles.historyDate} onSubmit={event=>{event.preventDefault();if(selected)view(selected);}}><label>查看日期<input aria-label="查看日期" type="date" max={today} required value={selected} onChange={event=>setSelected(event.target.value)}/></label><button className={styles.historyToggle} type="submit" disabled={!selected}>查看</button></form>
  {dates.slice(0,limit).map(renderRow)}
  {!dates.length&&<p className={styles.empty}>没有其他历史记录。</p>}
  {limit<dates.length&&<button className={styles.historyToggle} type="button" onClick={()=>setLimit(value=>value+50)}>加载更早日期</button>}
 </>;
}
