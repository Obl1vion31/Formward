"use client";
import {RecordTrendPanel,CustomRecordRange,type RecordMetric} from "@/components/record-trend-panel";
import {formatRecordNumber,signedRecordNumber,signedIntegerNumber} from "@/components/number-format";
import {DayNutritionSummary} from "../meals/nutrition-composition";
import {RangeCoverage} from "./range-coverage-view";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { preferredRecordedDate, rangeContaining } from "@/components/record-dates";
import {useLayoutEffect,useState} from "react";
import {useChartTransitionActions} from "@/components/chart-transition-state";
import { LoadingLink } from "@/components/loading-link";
import { RelationshipPlot } from "./relationship-plot";
import { BalanceReading } from "./day-readout";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { useMobileMode } from "@/components/use-mobile-mode";
import { isNestedChartPreset, useNestedChartRange } from "@/components/use-nested-chart-range";
import type { OverviewPresentation } from "./presentation";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { formatNutrition } from "../meals/model";
import { EditorDialog } from "../meals/meals-view";
import { SavedMealList } from "../meals/saved-meal-list";
import { blankEnergyDay, energyValue } from "../activities/model";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";
import {OverviewLegend} from '@/components/chart-legend';
const signed=signedRecordNumber;
function WeightReading({ record }: { record: MeasurementDisplay | null }) {
  return <><strong>{record ? formatRecordNumber(record.weightKg) : "—"}<small>kg</small></strong></>;
}
const blankDay = (date: string): OverviewDay => ({ date, nextDate: addCalendarDays(date, 1), meals: [], nutrition: null, morning: null, nextMorning: null, weightChangeKg: null, ambiguous: false, energy: blankEnergyDay(date), energyBalance: null, mealDayStatus: "unconfirmed", balanceEligible: false });
const overviewFlags=(day?:OverviewDay)=>[day?.nutrition&&day.mealDayStatus!=="complete"?"饮食"+(day.mealDayStatus==="incomplete"?"未记全":"待确认"):null,day?.nutrition?.incomplete.caloriesKcal?"营养含未知":null].filter(Boolean).join(" · ");
export function OverviewTrend({ data }: { data: OverviewPresentation }) {
  const today = data.today, mobile = useMobileMode();
  const {recallOverview,rememberOverview}=useChartTransitionActions();
  const [restored]=useState(recallOverview);
  const preferred = preferredRecordedDate(data.days, today, day => day.energyBalance !== null, day => data.recordDates.includes(day.date));
  const [mode, setMode] = useState<string | null>(restored?.mode??null), [custom, setCustom] = useState(restored?.custom??{ from: addCalendarDays(today, -29), to: today }), [opened, setOpened] = useState<string | null>(null);
  useLayoutEffect(()=>{rememberOverview({mode,custom});},[mode,custom,rememberOverview]);
  const [customOpen, setCustomOpen] = useState(false), [customDraft, setCustomDraft] = useState(custom);
  const [rangeRevision, setRangeRevision] = useState(0);
  const [nestedChange, setNestedChange] = useState(false);
  const range = mode ?? rangeContaining(preferred, today, mobile ? "7" : "30");
  const available = data.days;
  const byDate = new Map(available.map(day => [day.date, day]));
  const earliest = available.map(day => day.date).filter(date => date <= today).sort()[0] ?? today;
  const from = range === "all" ? earliest : range === "custom" ? custom.from : addCalendarDays(today, 1 - Number(range)), to = range === "custom" ? custom.to : today;
  const { bindPlot, prepare: prepareRange, finish: finishRange } = useNestedChartRange({ mode: range, from, to });
  let dates: string[] = [];
  try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; if (length > 0 && length <= 3661) dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)); } catch {}
  const days = dates.map(date => byDate.get(date) ?? blankDay(date));
  const fallback = preferredRecordedDate(days, today, day => day.energyBalance !== null, day => data.recordDates.includes(day.date));
  const selection=useChartDateSelection(dates,preferred,fallback,customOpen),selected=selection.selected,day=days.find(day=>day.date===selected),dialogDay=opened?byDate.get(opened)??blankDay(opened):null;
  function changeRange(key: string) {
    selection.leave();
    if (key === "custom") {
      finishRange();
      setCustomDraft(custom);
      setCustomOpen(true);
      return;
    }
    if (key !== range) {
      prepareRange(key);
      setNestedChange(isNestedChartPreset(range) && isNestedChartPreset(key));
      setRangeRevision(revision => revision + 1);
    }
    setMode(key);
    setCustomOpen(false);
  }
  function applyCustomRange() {
    if (customDraft.from !== from || customDraft.to !== to) {
      setNestedChange(false);
      setRangeRevision(revision => revision + 1);
    }
    setCustom(customDraft);
    setMode("custom");
    setCustomOpen(false);
  }
  const customControls = customOpen && <CustomRecordRange label="总览" value={customDraft} change={setCustomDraft} apply={applyCustomRange} cancel={()=>setCustomOpen(false)}/>;
  const motionRevision = mobile === null ? undefined : rangeRevision;
  const detailSuspended = customOpen || !!dialogDay;
  const rangeMotion = { motionRevision, nestedChange, bindRangePlot: mobile === null ? undefined : bindPlot, finishRange };
  function viewSelectedDay() {
    finishRange();
    selection.pin(selected);
    setOpened(selected);
  }


  return <section aria-label="热量与晨重趋势" data-chart-selection={selection.regionId} data-selected-date={selected} data-selection-origin={selection.origin} {...selection.regionProps}>
    {mobile!==false&&<div className={styles.mobileTrend+" mobile-only"}>
      <div className={styles.mobileTrendHeading}><h2>能量与次晨变化</h2><button type="button" onClick={viewSelectedDay}>查看记录 →</button></div>
      <ChartRanges value={mobile===null?(mode??rangeContaining(preferred,today,"7")):range} change={changeRange}/>
      {customControls}
      <div className={styles.mobileSelected} aria-live="polite"><time>{selected}</time><strong><BalanceReading balance={day?.energyBalance ?? null}/></strong></div>
      <div className={styles.mobileLegend}><OverviewLegend/></div>
      {dates.length ? <>
        <RelationshipPlot days={days} selected={selected} selection={selection} compactMode {...rangeMotion} suspended={detailSuspended}/>
        <OverviewReadings day={day} mobile/>
      </> : <p className={styles.caption}>请选择有效日期范围，最长10年。</p>}
    </div>}{mobile!==true&&<div className="desktop-only"><RecordTrendPanel
      range={<ChartRanges value={range} change={changeRange}/>}
      custom={customControls}
      date={selected} view={viewSelectedDay}
      readoutLabel="日期对照"
      metricVariants={days.map(day=>[formatNutrition(day.nutrition?.values.caloriesKcal??null,"caloriesKcal"),energyValue(day.energy.totalKcal),signedIntegerNumber(day.energyBalance),formatRecordNumber(day.morning?.weightKg??null),formatRecordNumber(day.nextMorning?.weightKg??null),signed(day.weightChangeKg)])}
      metrics={overviewMetrics(day??blankDay(selected),false)}
      labelVariants={days.map(row=>overviewMetrics(row,false).map(metric=>metric.label))}
      supplementary={<OverviewReadings day={day} mobile={false} variants={days}/>} statusInDate
      flags={overviewFlags(day)} flagVariants={days.map(overviewFlags)}
      title="热量收支" unit="kcal"
      legend={<OverviewLegend/>}
    >{dates.length?<RelationshipPlot days={days} selected={selected} selection={selection} compactMode={false} {...rangeMotion} suspended={detailSuspended}/>:<p className={styles.caption}>请选择有效日期范围，最长10年。</p>}</RecordTrendPanel></div>}
    {mobile!==true&&<div className="desktop-only"><RangeCoverage key={from+to} days={days} today={today} from={from} to={to}/></div>}
    {dialogDay&&<EditorDialog title={dialogDay.date+" · 当日记录"} titleParts={[dialogDay.date,"当日记录"]} stableScroll close={()=>setOpened(null)} busy={false}><OverviewDayDetails day={dialogDay}/></EditorDialog>}
  </section>;
}

function overviewMetrics(day:OverviewDay,mobile:boolean):RecordMetric[]{
 return [
  {id:"intake",label:"摄入",value:formatNutrition(day.nutrition?.values.caloriesKcal??null,"caloriesKcal"),unit:"kcal",tone:"blue"},
  {id:"energy",label:"消耗",value:energyValue(day.energy.totalKcal),unit:"kcal",tone:"red"},
  {id:"balance",label:day.energyBalance==null?"收支":day.energyBalance===0?"持平":day.energyBalance<0?"缺口":"盈余",value:signedIntegerNumber(day.energyBalance),unit:"kcal",tone:day.energyBalance!=null&&day.energyBalance<0?"blue":"gold"},
  ...(!mobile?[
   {id:"morning",label:"晨重 "+day.date.slice(5).replace("-","."),value:formatRecordNumber(day.morning?.weightKg??null),unit:"kg",inlineUnit:true},
   {id:"next",label:"次晨 "+day.nextDate.slice(5).replace("-","."),value:formatRecordNumber(day.nextMorning?.weightKg??null),unit:"kg",inlineUnit:true},
   {id:"change",label:"次晨变化",value:signed(day.weightChangeKg),unit:"kg",inlineUnit:true}
  ]:[])
 ];
}
function StableReadingText({value,variants}:{value:string;variants:string[]}){
 return <span className={styles.stableText}>{[...new Set(variants.filter(Boolean))].map(text=><span className={styles.stableMeasure} aria-hidden="true" key={text}>{text}</span>)}<span>{value}</span></span>;
}
const weekBasis = (day?: OverviewDay) => {
  const week = day?.week;
  if (!week) return "暂无记录";
  if (week.missingMorningDates.length) return "缺" + week.missingMorningDates.map(shortWeekDate).join("、") + "晨重";
  return "晨重 " + shortWeekDate(week.from) + " " + formatRecordNumber(week.startWeightKg) + " → " + shortWeekDate(week.nextDate) + " " + formatRecordNumber(week.endWeightKg) + " kg";
};
const shortWeekDate = (date?: string) => date?.slice(5).replace("-", ".") ?? "—";

function OverviewDayDetails({day}:{day:OverviewDay}){
 return <div className={styles.dayDetails}>
  <div className={styles.detailTop}>
   <section><h3>晨间体重</h3><div className={styles.detailReading}><WeightReading record={day.morning}/></div><p>次晨 {day.nextDate.slice(5)} · {day.nextMorning?formatRecordNumber(day.nextMorning.weightKg)+" kg":"未记录"}{day.weightChangeKg!==null?<b>变化 {signed(day.weightChangeKg)} kg</b>:day.nextMorning?<b>未配对</b>:null}</p><LoadingLink href={"/dashboard/measurements?date="+day.date}>身体记录 →</LoadingLink></section>
   <section><h3>消耗</h3><div className={styles.detailReading}><strong>{energyValue(day.energy.totalKcal)}<small>千卡</small></strong></div><p>静息 {energyValue(day.energy.restingKcal)} · 活动 {energyValue(day.energy.activeKcal)} 千卡</p>{day.energy.record?.calculationSnapshot&&<p>系统估算 · {day.energy.record.calculationSnapshot.method==="cunningham"?"体脂公式":"常规公式"}{day.energy.record.calculationSnapshot.factor?" ×"+day.energy.record.calculationSnapshot.factor:""}</p>}<LoadingLink href={"/dashboard/energy?date="+day.date}>消耗记录 →</LoadingLink></section>
  </div>
  <section className={styles.detailNutrition}>{day.nutrition&&day.mealDayStatus!=="complete"&&<span className={styles.mealDayStatus}>{day.mealDayStatus==='incomplete'?'饮食未记全':'饮食待确认'}</span>}<DayNutritionSummary totals={day.nutrition} partial={day.mealDayStatus!=="complete"}/></section>
  <SavedMealList meals={day.meals} initialLimit={3}/>
  <LoadingLink href={"/dashboard/meals?date="+day.date}>查看饮食记录 →</LoadingLink>
 </div>;
}

/** 两端共用已计算的七天统计，依据只呈现实际覆盖与测量。 */
export function OverviewReadings({day, mobile, variants = [], pending = false}: {
  day?: OverviewDay; mobile: boolean; variants?: OverviewDay[]; pending?: boolean;
}) {
  const week = day?.week;
  const energy = week?.energyBalance ?? null;
  const weight = week?.weightChangeKg ?? null;
  const covered = week?.coveredDays;
  const coverage = covered === undefined ? null : covered + "/7天";
  const energyLabel = energy === null || energy === 0 ? "收支" : energy < 0 ? "缺口" : "盈余";
  const energyTone = energy === null || energy === 0 ? undefined : energy < 0 ? styles.weekDeficit : styles.weekSurplus;
  const from = week?.from ?? (day && addCalendarDays(day.date, -6));
  const period = <time>{shortWeekDate(from)}—{shortWeekDate(week?.through ?? day?.date)}</time>;

  if (mobile) return <details className={styles.mobileWeek} aria-label="选中日七天统计" data-overview-week="mobile">
    <summary className={styles.mobileWeekSummary}>
      <span className={styles.mobileWeekHeading}>
        <span>近7天 {period}</span>
        <span className={styles.mobileWeekToggle}>依据 <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.2"/>
        </svg></span>
      </span>
      <span className={styles.mobileWeekNumbers}>
        <span data-overview-week-energy>
          <span>{energyLabel}</span>
          <strong className={energyTone}>{signedIntegerNumber(energy)}{energy !== null && <small>千卡</small>}</strong>
          {energy !== null && covered !== 7 && coverage && <span className={styles.mobileWeekCoverage}>（{coverage}）</span>}
        </span>
        <span data-overview-week-weight>
          <span>体重变化</span>
          <strong>{signed(weight)}{weight !== null && <small>kg</small>}</strong>
        </span>
      </span>
    </summary>
    <div className={styles.mobileWeekBasis} data-overview-week-basis>
      {coverage && <span>收支已计{coverage}</span>}
      <span>{weekBasis(day)}</span>
    </div>
  </details>;

  return <section className={styles.weekReadings} aria-label="选中日七天统计" aria-hidden={pending || undefined} data-pending={pending || undefined} data-overview-week={pending ? undefined : "desktop"}>
    <div className={styles.weekContent}>
      <header>近7天 {period}</header>
      <div className={styles.weekNumbers}>
        <div data-overview-week-energy><span>热量{energyLabel}</span><strong className={energyTone}>{signedIntegerNumber(energy)}<small>千卡</small></strong></div>
        <div data-overview-week-weight><span>体重变化</span><strong>{signed(weight)}<small>kg</small></strong></div>
      </div>
      <span className={styles.weekCoverage}>{coverage ? "已计" + coverage : "—"}</span>
      <p className={styles.weekBasis}><StableReadingText value={weekBasis(day)} variants={variants.map(weekBasis)}/></p>
    </div>
  </section>;
}
