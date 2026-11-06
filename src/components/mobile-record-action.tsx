"use client";
import { TrendBackLink } from "./chart-transition";
export function MobileRecordAction({label,date,back=false,record}:{label:string;date:string;back?:boolean;record:()=>void}){
  return <div className="mobile-record-actions">{back&&<TrendBackLink/>}<button type="button" className="mobile-record-action" aria-label={label+" "+date} onClick={record}><svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>{label}</button></div>;
}
