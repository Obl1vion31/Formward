"use client";
import styles from "./profile.module.css";

/** 年份是独立入口；不依赖系统日历里不明显的年份切换。部分选择只留在表单草稿。 */
export function BirthDateInput({value,today,disabled,onChange}:{value:string;today:string;disabled:boolean;onChange:(value:string)=>void}) {
  const parts=value?value.split("-"):["","",""], [thisYear,thisMonth,thisDay]=today.split("-"),year=Number(thisYear);
  const days=(y:string,m:string)=>m?new Date(Date.UTC(Number(y)||2000,Number(m),0)).getUTCDate():31;
  const choose=(index:number,next:string)=>{
    const updated=[...parts];updated[index]=next;
    if(updated[0]===thisYear&&updated[1]>thisMonth){updated[1]="";updated[2]="";}
    if(Number(updated[2])>days(updated[0],updated[1])||updated[0]===thisYear&&updated[1]===thisMonth&&updated[2]>thisDay)updated[2]="";
    onChange(updated.some(Boolean)?updated.join("-"):"");
  };
  const select=(label:string,index:number,options:{value:string;label:string;disabled?:boolean}[])=><span className={styles.birthSelect}>
    <select aria-label={label} value={parts[index]??""} disabled={disabled} onChange={event=>choose(index,event.target.value)}>
      <option value="">{index===0?"选择年份":index===1?"月":"日"}</option>
      {options.map(option=><option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
  </span>;
  return <div role="group" aria-label="出生日期" className={styles.birthPicker}>
    {select("出生年份",0,Array.from({length:year-1899},(_,i)=>({value:String(year-i),label:`${year-i}年`})))}
    {select("出生月份",1,Array.from({length:12},(_,i)=>({value:String(i+1).padStart(2,"0"),label:`${i+1}月`,disabled:parts[0]===thisYear&&i+1>Number(thisMonth)})))}
    {select("出生日期中的日",2,Array.from({length:days(parts[0],parts[1])},(_,i)=>({value:String(i+1).padStart(2,"0"),label:`${i+1}日`,disabled:parts[0]===thisYear&&parts[1]===thisMonth&&i+1>Number(thisDay)})))}
  </div>;
}
