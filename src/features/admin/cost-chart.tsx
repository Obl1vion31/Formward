"use client";
import { useEffect,useId,useRef,useState } from "react";
import { loadAdminDayAction } from "@/app/admin/actions";
import { LoadingLink as Link } from "@/components/loading-link";
import type { AdminConsoleData,AdminDayData,DayGroup } from "./queries";
import { adminCurrency,type AdminFilter } from "./model";
import styles from "./console.module.css";

const count=(value:string|number|null)=>value===null?"未知":Number(value).toLocaleString("zh-CN");
const provider=(value:string|null)=>(({qwen:"千问",mimo:"MiMo",glm:"智谱"} as Record<string,string>)[value??""]??value??"");
type Metric="cost"|"requests"|"tokens";
export function CostChart({data,metric,onVerificationRequired}:{data:AdminConsoleData;metric:Metric;onVerificationRequired:()=>void}) {
  const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(900),[hover,setHover]=useState<number|null>(null),[pinned,setPinned]=useState<number|null>(null),tooltip=useId();
  useEffect(()=>{const node=container.current;if(!node)return;const update=()=>setWidth(Math.max(240,node.clientWidth));update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();},[]);
  const days=data.days,values=days.map(day=>!day.covered?null:metric==="cost"?Number(day.spent):metric==="requests"?day.requests:day.output===null?null:Number(day.output));
  const maximum=Math.max(metric==="cost"?.0001:1,...values.filter((v):v is number=>v!==null))*1.12;
  const x=(i:number)=>62+(days.length===1?(width-90)/2:i/(days.length-1)*(width-90)),y=(value:number)=>216-value/maximum*188;
  const path=days.map((day,i)=>values[i]===null?"":`${i>0&&values[i-1]!==null?"L":"M"}${x(i)},${y(values[i]!)}`).join(" ");
  const index=hover??pinned,day=index===null?null:days[index];
  const nearest=(clientX:number,bounds:DOMRect)=>days.length===1?0:Math.max(0,Math.min(days.length-1,Math.round((clientX-bounds.left-62)/(width-90)*(days.length-1))));
  const models=day?data.highlights.models.filter(row=>row.date===day.date):[],users=day?data.highlights.users.filter(row=>row.date===day.date):[];
  return <><div ref={container} className={`${styles.chart} ${styles.interactiveChart}`} data-cost-chart onPointerLeave={()=>setHover(null)} onKeyDown={e=>{if(e.key==="Escape"){setHover(null);setPinned(null);}}}>
    <svg viewBox={`0 0 ${width} 260`} role="slider" tabIndex={0} aria-label="每日趋势，左右方向键选择日期，回车展开明细" aria-valuemin={1} aria-valuemax={days.length} aria-valuenow={(index??days.length-1)+1} aria-valuetext={day?`${day.date}，${!day.covered?"未覆盖":metric==="cost"?adminCurrency(day.spent):count(values[index!])}`:days.at(-1)?.date} aria-describedby={day&&hover!==null?tooltip:undefined}
      onPointerMove={e=>{if(e.pointerType!=="touch")setHover(nearest(e.clientX,e.currentTarget.getBoundingClientRect()));}} onClick={e=>{const i=nearest(e.clientX,e.currentTarget.getBoundingClientRect());setPinned(i);setHover(null);}} onFocus={()=>setHover(pinned??days.length-1)} onBlur={()=>setHover(null)} onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();setHover(e.key==="Home"?0:e.key==="End"?days.length-1:Math.max(0,Math.min(days.length-1,(index??days.length-1)+(e.key==="ArrowRight"?1:-1))));}if(e.key==="Enter"||e.key===" "){e.preventDefault();setPinned(index??days.length-1);setHover(null);}}}>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="62" x2={width-24} y1={y(maximum*i/4)} y2={y(maximum*i/4)}/><text x="54" y={y(maximum*i/4)+4} textAnchor="end">{metric==="cost"?"¥"+(maximum*i/4).toFixed(4):Math.round(maximum*i/4).toLocaleString()}</text></g>)}<path className={styles.costLine} d={path}/>
      {days.map((d,i)=>values[i]===null?null:<circle key={d.date} cx={x(i)} cy={y(values[i]!)} r={days.length>100?2:3.5}/>)}
      {index!==null&&<g className={styles.chartCursor}><line x1={x(index)} x2={x(index)} y1="24" y2="218"/>{values[index]!==null&&<circle cx={x(index)} cy={y(values[index]!)} r="5"/>}</g>}
      {[...new Set([0,.25,.5,.75,1].map(r=>Math.round((days.length-1)*r)))].map(i=><text key={i} x={x(i)} y="246" textAnchor="middle">{days[i]?.date.slice(5)}</text>)}
    </svg>
    {day&&index!==null&&hover!==null&&<div id={tooltip} role="tooltip" className={styles.chartTooltip} style={{left:Math.max(6,Math.min(width-298,x(index)+(x(index)>width/2?-290:14))),top:12}}><div><strong>{day.date.slice(5).replace("-","月")}日</strong><span>{day.covered?metric==="cost"?adminCurrency(day.spent):`${count(values[index])}${metric==="requests"?"次请求":" Token"}`:"账本未覆盖"}</span></div>{day.covered&&<><small>已结算 {adminCurrency(day.spent)} · 请求 {day.requests}次</small>{(Number(day.reserved)>0||Number(day.uncertain)>0)&&<small>预占 {adminCurrency(day.reserved)} · 未知 {adminCurrency(day.uncertain)}</small>}<Highlight title="模型" rows={models}/>{!data.filter.userId&&<Highlight title="用户" rows={users}/>}<small>{pinned===index?"已选中，明细在图表下方":"点击查看当天明细"}</small></>}</div>}
  </div>{pinned!==null&&<DayDetails key={days[pinned].date} data={data} date={days[pinned].date} covered={days[pinned].covered} close={()=>{setPinned(null);setHover(null);container.current?.querySelector<SVGElement>("svg")?.focus();}} onVerificationRequired={onVerificationRequired}/>}</>;
}
function Highlight({title,rows}:{title:string;rows:DayGroup[]}){return rows.length?<div className={styles.chartHighlight}><small>{title}{rows[0].groups>2?`（前2／${rows[0].groups}）`:""}</small>{rows.slice(0,2).map(row=><div key={row.key}><span>{row.label}</span><span>{adminCurrency(row.spent)}</span></div>)}</div>:null;}

function DayDetails({data,date,covered,close,onVerificationRequired}:{data:AdminConsoleData;date:string;covered:boolean;close:()=>void;onVerificationRequired:()=>void}) {
  const [dimension,setDimension]=useState<"users"|"models">(data.filter.userId?"models":"users"),[userId,setUserId]=useState<string|undefined>(),[model,setModel]=useState<{name:string;provider:string}|null>(null),[page,setPage]=useState(1);
  const [retry,setRetry]=useState(0),sequence=useRef(0),verification=useRef(onVerificationRequired);
  const requestKey=JSON.stringify([data.filter,date,dimension,page,userId,model,retry]);
  const [loaded,setLoaded]=useState<{key:string;result:AdminDayData|null;error:string}|null>(null);
  const result=loaded?.key===requestKey?loaded.result:null,error=loaded?.key===requestKey?loaded.error:"",busy=loaded?.key!==requestKey;
  useEffect(()=>{verification.current=onVerificationRequired;},[onVerificationRequired]);
  useEffect(()=>{
    if(!covered)return;const request=++sequence.current;let live=true;
    void loadAdminDayAction({...data.filter,from:date,to:date,userId:userId??data.filter.userId,model:model?.name??data.filter.model,provider:model?.provider as AdminFilter["provider"]??data.filter.provider},{dimension,page}).then(response=>{
      if(!live||request!==sequence.current)return;if(response.ok)setLoaded({key:requestKey,result:response.data,error:""});else{setLoaded({key:requestKey,result:null,error:response.error});if(["verification_required","invalid_session","mfa_required"].includes(response.code))verification.current();}
    }).catch(()=>{if(live)setLoaded({key:requestKey,result:null,error:"明细暂未读取，请重试。当前日期与筛选保留。"});});return()=>{live=false;};
  },[data.filter,date,dimension,page,userId,model,covered,retry,requestKey]);
  const filter={...data.filter,from:date,to:date,userId:userId??data.filter.userId,model:model?.name??data.filter.model,provider:model?.provider??data.filter.provider};
  const params=new URLSearchParams();Object.entries(filter).forEach(([key,value])=>{if(value!==undefined&&value!=="")params.set(key,String(value));});params.set("tab","usage");params.set("page","1");
  const returnParams=new URLSearchParams({tab:"usage"});Object.entries(data.filter).forEach(([key,value])=>{if(value!==undefined&&value!=="")returnParams.set(key,String(value));});
  const currentUser=userId?data.userOptions.find(u=>u.id===userId):null;
  return <section className={styles.dayPanel} aria-label="当日明细" data-day-details onKeyDown={e=>{if(e.key==="Escape")close();}}><div className={styles.dayHeading}><h2>{date} · 当日明细</h2><button className={styles.secondary} onClick={close}>收起明细</button></div>
    {!covered?<p className={styles.caption}>这一天未覆盖可验证的模型费用账本。</p>:<><div className={styles.dayControls}>{!data.filter.userId&&<div role="group" aria-label="明细视角">{([['users','按用户'],['models','按模型']]as const).map(([key,label])=><button key={key} className={dimension===key?styles.chosen:styles.textButton} aria-pressed={dimension===key} onClick={()=>{setDimension(key);setPage(1);}}>{label}</button>)}</div>}<div className={styles.dayCrumbs}>{currentUser&&<button className={styles.secondary} onClick={()=>{setUserId(undefined);setPage(1);}}>用户：{currentUser.email} ×</button>}{model&&<button className={styles.secondary} onClick={()=>{setModel(null);setPage(1);}}>模型：{model.name} ×</button>}</div></div>
    <p className={styles.caption} role="status">{error?"读取未完成":busy?"正在读取当日明细…":`已结算 ${adminCurrency(result?.total.spent??null)} · 模型请求 ${result?.total.requests??0}次 · 预占 ${adminCurrency(result?.total.reserved??null)} · 未知 ${adminCurrency(result?.total.uncertain??null)}`}</p>
    {error?<div><p className={styles.error} role="alert">{error}</p><button className={styles.secondary} onClick={()=>setRetry(v=>v+1)}>重试明细</button></div>:<div className={styles.dayTable} aria-busy={busy}><div className={styles.dayTableHead}><span>{dimension==="users"?"用户":"模型"}</span><span>已结算／请求</span><span>Token · 输入／缓存／输出</span></div>{busy?<p className={styles.empty}>正在读取…</p>:!result?.rows.length?<p className={styles.empty}>这一天没有符合条件的模型请求。</p>:result.rows.map(row=><div className={styles.dayRow} key={row.key}><div><button className={styles.textButton} onClick={()=>{if(dimension==="users"){setUserId(row.key);setDimension("models");}else{setModel({name:row.label,provider:row.provider!});if(!data.filter.userId)setDimension("users");}setPage(1);}}>{row.label}</button>{dimension==="models"&&<small>{provider(row.provider)}</small>}{dimension==="users"&&<Link href={`/admin/users/${encodeURIComponent(row.key)}?${params}&returnTo=${encodeURIComponent("/admin?"+returnParams)}`}>用户概况</Link>}</div><div><strong>{adminCurrency(row.spent)}</strong><small>{row.requests}次请求</small>{(Number(row.reserved)>0||Number(row.uncertain)>0)&&<small>预占 {adminCurrency(row.reserved)} · 未知 {adminCurrency(row.uncertain)}</small>}</div><div><span>{count(row.input)}／{count(row.cached)}／{count(row.output)}</span><small>{row.unknownUsage?`${row.unknownUsage}次请求缺少完整用量`:"用量已返回"}</small></div></div>)}</div>}
    <div className={styles.dayFooter}><p className={styles.caption}>点击{dimension==="users"?"用户查看所用模型":"模型进一步筛选"}；Token仅统计已知部分，缓存属于输入的一部分。</p>{result&&result.count>50&&<div className={styles.pagination}><button className={styles.secondary} disabled={busy||page===1} onClick={()=>setPage(v=>v-1)}>上一页</button><span>第{page}页 · 共{result.count}项</span><button className={styles.secondary} disabled={busy||page*50>=result.count} onClick={()=>setPage(v=>v+1)}>下一页</button></div>}</div></>}
  </section>;
}
