import { linkedDate } from '../features/measurements/calendar';

export type RecordIntent = 'view' | 'edit' | 'create';
export type RecordTask={path:'/dashboard/meals'|'/dashboard/energy'|'/dashboard/measurements';date:string;intent:RecordIntent;period?:'daytime'|'evening'};

/** URL 仅指定网页打开方式，所有写入继续由原会话、校验与确认控制。 */
export function recordOpenIntent(params: { date?: string | string[]; intent?: string | string[] }, entry = false, trend = false): RecordIntent {
  if (!linkedDate(params.date)) return 'view';
  if (entry) return 'create';
  return !trend && params.intent === 'edit' ? 'edit' : 'view';
}

/** 同一网页任务再次点击时交给已挂载业务，不重复加载或丢弃其他地址的导航。 */
export function repeatedRecordTask(href:string,currentHref:string):RecordTask|null {
  try{
    const current=new URL(currentHref),target=new URL(href,current);
    if(target.origin!==current.origin||target.pathname!==current.pathname||target.hash!==current.hash)return null;
    const path=target.pathname;
    if(path!=='/dashboard/meals'&&path!=='/dashboard/energy'&&path!=='/dashboard/measurements')return null;
    const query=(url:URL)=>{const params=new URLSearchParams(url.search);params.sort();return params.toString();};
    if(query(target)!==query(current)||target.searchParams.get('view')==='trend')return null;
    const dates=target.searchParams.getAll('date'),date=dates.length===1?linkedDate(dates[0]):null;
    if(!date)return null;
    const entries=target.searchParams.getAll('entry'),entry=entries.length===1?entries[0]:null;
    const period=path==='/dashboard/measurements'&&(entry==='daytime'||entry==='evening')?entry:undefined;
    const create=!!period||path!=='/dashboard/measurements'&&entry==='1';
    const intents=target.searchParams.getAll('intent');
    return{path,date,intent:recordOpenIntent({date,intent:intents.length===1?intents[0]:undefined},create),...(period?{period}:{})};
  }catch{return null;}
}
