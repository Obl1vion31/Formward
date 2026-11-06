"use client";
import { useState } from "react";
import { MetricCardRail, type MetricCard } from "@/components/metric-card-rail";
import { metricTrendModel } from "@/components/metric-trend-model";
import { TrendGlyph } from "@/components/trend-glyph";
import { Inspector } from "@/components/inspector";
import { MobileNavigation } from "@/components/mobile-navigation";
import { normalScale } from "../measurements/trend";
import { RelationshipPlot } from "./relationship-plot";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { blankEnergyDay } from "../activities/model";
import type { OverviewDay } from "./model";
import styles from "./material-review.module.css";

const dates=Array.from({length:7},(_,i)=>`2026-11-${String(i+1).padStart(2,"0")}`);
const sampleDays:OverviewDay[]=dates.map((date,index)=>{
  const intake=[1740,2100,1878,null,1925,2280,1190][index],energy=[2500,2370,2200,null,2620,2415,null][index];
  return {date,nextDate:`2026-11-${String(index+2).padStart(2,"0")}`,meals:[],nutrition:intake===null?null:{values:{caloriesKcal:String(intake),proteinG:null,carbsG:null,fatG:null},incomplete:{caloriesKcal:false,proteinG:true,carbsG:true,fatG:true}},morning:null,nextMorning:null,weightChangeKg:[-.03,-.04,null,-.05,-.04,null,null][index],differenceEstimated:false,ambiguous:false,energy:{...blankEnergyDay(date),totalKcal:energy===null?null:String(energy)},energyBalance:energy!==null&&intake!==null?intake-energy:null,mealDayStatus:"complete",balanceEligible:intake!==null&&energy!==null};
});
function cards(long:boolean):MetricCard[]{
  const points=(values:(number|null)[])=>dates.map((date,index)=>({date,value:values[index]}));
  return [
    {title:"今日摄入",value:long?"98765432":"1190",unit:"kcal",date:dates[6],fact:"1餐",href:"#intake",trend:metricTrendModel("intake",points([1740,2100,1878,null,1925,2280,1190]))},
    {title:"最近晨重",value:long?"123456.78":"70.18",unit:"kg",date:dates[5],href:"#weight",trend:metricTrendModel("morning-weight",points([70.52,70.35,null,70.27,70.22,70.18,null]),normalScale([70.52,70.35,70.27,70.22,70.18]))},
    {title:"最近消耗",value:"2415",unit:"kcal",date:dates[5],href:"#energy",trend:metricTrendModel("energy",points([2500,2370,2200,null,2620,2415,null]))},
  ];
}
function MaterialPane({variant,theme,width,long,opaque}:{variant:"current"|"warm";theme:"light"|"dark";width:number;long:boolean;opaque:boolean}){
  const [path,setPath]=useState("/dashboard"),[detail,setDetail]=useState<MetricCard|null>(null);
  const selection=useChartDateSelection(dates,dates[2],dates[2],false);
  return <section className={styles.column}><h2>{variant==="current"?"当前材质":"统一新方案"}</h2><div className={styles.phone} data-material={variant} data-theme={theme} data-opaque={opaque} style={{width}}>
    <div className={styles.scroll}>
      <header className={styles.sampleHeading}><strong>今天</strong><time>11月7日</time></header>
      <div className={styles.actions}>{["记录饮食","记录测量","记录消耗"].map(label=><button type="button" key={label} onClick={()=>setDetail(cards(long)[0])}><svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>{label}</button>)}</div>
      <MetricCardRail cards={cards(long)} preview={setDetail}/>
      <div className={styles.chartHeading}><h3>能量与次晨变化</h3><span>11.01—11.07</span></div>
      <div data-chart-selection={selection.regionId} {...selection.regionProps}><RelationshipPlot days={sampleDays} selected={selection.selected} selection={selection} compactMode/></div>
      <div className={styles.passages} aria-label="经过底栏的明暗内容"><div className={styles.bright}><strong>亮色内容</strong><p>图表、照片或其他明亮区域经过底栏。</p></div><div className={styles.dark}><strong>深色内容</strong><p>检查导航文字与选中标记。</p></div>{dates.map((date,index)=><div className={styles.row} key={date}><time>{date}</time><span>{index%2?"体重 70.18 kg":"摄入 1878 kcal"}</span></div>)}</div>
    </div>
    <MobileNavigation pathname={path} onSelect={setPath}/>
    {detail&&<Inspector title={detail.title+" · 虚构数据"} stableScroll close={()=>setDetail(null)}><div className={styles.detail}><p>{detail.trend.points[0].date}—{detail.trend.points.at(-1)?.date}</p><div className={styles.previewPlot}><TrendGlyph model={detail.trend}/></div><p>日期详情与录入沿用同一面板；正文保持清楚的内容底色。</p><dl>{detail.trend.points.map(point=><div key={point.date}><dt>{point.date}</dt><dd>{point.value??"未记录"} {detail.unit}</dd></div>)}</dl></div></Inspector>}
  </div></section>;
}
export function MaterialReview(){
  const [theme,setTheme]=useState<"light"|"dark">("light"),[width,setWidth]=useState(390),[long,setLong]=useState(false),[opaque,setOpaque]=useState(false);
  return <main className={styles.review}><header><h1>材质对照</h1><p>相同 B 卡片结构与虚构数据，只比较材质。横滑卡片、拖动底栏，向下滚动检查明暗内容经过玻璃背后。</p></header><div className={styles.controls}>
    <div role="group" aria-label="对照主题">{(["light","dark"] as const).map(value=><button type="button" key={value} aria-pressed={theme===value} onClick={()=>setTheme(value)}>{value==="light"?"浅色":"深色"}</button>)}</div>
    <label>手机宽度<select value={width} onChange={e=>setWidth(Number(e.target.value))}>{[320,390,430].map(value=><option key={value}>{value}</option>)}</select></label>
    <label><input type="checkbox" checked={long} onChange={e=>setLong(e.target.checked)}/>长数值</label><label><input type="checkbox" checked={opaque} onChange={e=>setOpaque(e.target.checked)}/>无模糊回退</label>
  </div><div className={styles.comparison}>{(["current","warm"] as const).map(variant=><MaterialPane key={variant} variant={variant} theme={theme} width={width} long={long} opaque={opaque}/>)}</div></main>;
}
