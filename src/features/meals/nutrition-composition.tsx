import {formatNutrition,macroComposition,macroColors,metricLabels,type Totals} from "./model";
import styles from "./nutrition-composition.module.css";

const percent=(value:number)=>new Intl.NumberFormat("zh-CN",{maximumFractionDigits:1}).format(value*100)+"%";
export function NutritionComposition({totals,small=false,partial=false,ringOnly=false}:{totals:Totals|null|undefined;small?:boolean;partial?:boolean;ringOnly?:boolean}){
 const {kind,segments}=macroComposition(totals);
 const description=kind==="known"?segments.map(s=>metricLabels[s.metric]+percent(s.ratio)).join("、"):kind==="zero"?"三项均为0，暂无供能占比":"营养未齐，暂不计算占比";
 return <figure className={small?styles.small:styles.composition} data-nutrition-composition={kind}>
  <svg viewBox="0 0 100 100" role="img" aria-label={"蛋白质、碳水、脂肪供能比例："+description}>
   <circle cx="50" cy="50" r="38" fill="none" stroke="var(--line-strong)" strokeWidth="12"/>
   {segments.map((segment,index)=>{const start=segments.slice(0,index).reduce((sum,s)=>sum+s.ratio*100,0);return <circle key={segment.metric} data-macro-share={segment.metric} data-ratio={segment.ratio} cx="50" cy="50" r="38" pathLength="100" fill="none" stroke={macroColors[segment.metric]} strokeWidth="12" strokeDasharray={`${segment.ratio*100} ${100-segment.ratio*100}`} strokeDashoffset={-start} transform="rotate(-90 50 50)"/>;})}
   <text x="50" y="54" textAnchor="middle" fill="var(--muted)" fontSize={small?"22":"17"}>{kind==="known"?(small?"":"供能"):kind==="zero"?"0":"—"}</text>
  </svg>
  {!small&&!ringOnly&&<figcaption><span>{partial?"已记录营养构成":"营养供能占比"}</span>{kind==="known"?<CompositionLegend totals={totals}/>:<p>{description}</p>}</figcaption>}
 </figure>;
}
export function CompositionLegend({totals}:{totals:Totals|null|undefined}){
 const {kind,segments}=macroComposition(totals);
 return kind==="known"?<span className={styles.legend}>{segments.map(s=><span key={s.metric}><i style={{background:macroColors[s.metric]}}/>{metricLabels[s.metric]} <b>{percent(s.ratio)}</b></span>)}</span>:null;
}

export function DayNutritionSummary({totals,partial=false}:{totals:Totals|null|undefined;partial?:boolean}){
 const state=macroComposition(totals);
 return <div className={styles.summary} data-day-nutrition-summary role="group" aria-label={partial?"当天已记录营养合计":"当天营养合计"}>
  <NutritionComposition totals={totals} ringOnly/>
  <div className={styles.content}><div className={styles.numbers}>{(["caloriesKcal","proteinG","carbsG","fatG"] as const).map(metric=><div key={metric}><span>{metric==="caloriesKcal"?"当天合计":metricLabels[metric]}{totals?.incomplete[metric]&&<small> · 已知部分</small>}</span><strong>{formatNutrition(totals?.values[metric]??null,metric)}<small>{metric==="caloriesKcal"?"kcal":"g"}</small></strong></div>)}</div>
   <div className={styles.shares}>{state.kind!=="known"&&<p className={styles.caption}>{state.kind==="zero"?"零供能":"营养未齐"}</p>}<CompositionLegend totals={totals}/></div>
  </div>
 </div>;
}
