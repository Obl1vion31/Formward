"use client";
import {CustomRecordRange} from "@/components/record-trend-panel";
import {formatRecordNumber,signedRecordNumber} from "@/components/number-format";
import {DayNutritionSummary} from "../meals/nutrition-composition";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { preferredRecordedDate, rangeContaining } from "@/components/record-dates";
import {useLayoutEffect,useState} from "react";
import {useChartTransitionActions} from "@/components/chart-transition-state";
import { LoadingLink } from "@/components/loading-link";
import { RelationshipPlot } from "./relationship-plot";
import { OverviewTrendLayout } from "./overview-trend-layout";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { useMobileMode } from "@/components/use-mobile-mode";
import { isNestedChartPreset, useNestedChartRange } from "@/components/use-nested-chart-range";
import type { OverviewPresentation } from "./presentation";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { EditorDialog } from "../meals/meals-view";
import { SavedMealList } from "../meals/saved-meal-list";
import { blankEnergyDay, energyValue } from "../activities/model";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";
const signed=signedRecordNumber;
function WeightReading({ record }: { record: MeasurementDisplay | null }) {
  return <><strong>{record ? formatRecordNumber(record.weightKg) : "—"}<small>kg</small></strong></>;
}
const blankDay = (date: string): OverviewDay => ({ date, nextDate: addCalendarDays(date, 1), meals: [], nutrition: null, morning: null, nextMorning: null, weightChangeKg: null, ambiguous: false, energy: blankEnergyDay(date), energyBalance: null, mealDayStatus: "unconfirmed", balanceEligible: false });
export function OverviewTrend({ data }: { data: OverviewPresentation }) {
  const today = data.today, mobile = useMobileMode();
  const {recallOverview,rememberOverview}=useChartTransitionActions();
  const [restored]=useState(recallOverview);
  const preferred = preferredRecordedDate(data.days, today, day => day.energyBalance !== null, day => data.recordDates.includes(day.date));
  const [mode, setMode] = useState<string | null>(restored?.mode??null), [custom, setCustom] = useState(restored?.custom??{ from: addCalendarDays(today, -29), to: today }), [opened, setOpened] = useState<string | null>(null);
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
  const selection=useChartDateSelection(dates,preferred,fallback,customOpen,"",true,restored?.selectedDate),selected=selection.selected,day=days.find(day=>day.date===selected),dialogDay=opened?byDate.get(opened)??blankDay(opened):null;
  const selectedDate=selection.locked||selection.direct?selected:undefined;
  useLayoutEffect(()=>{rememberOverview({mode,custom,selectedDate});},[mode,custom,selectedDate,rememberOverview]);
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
  const plotOptions = { motionRevision, nestedChange, bindRangePlot: mobile === null ? undefined : bindPlot, finishRange, guideRange: range };
  function viewSelectedDay() {
    finishRange();
    selection.pin(selected);
    setOpened(selected);
  }


  return <section aria-label="热量与晨重趋势" data-chart-selection={selection.regionId} data-selected-date={selected} data-selection-origin={selection.origin} {...selection.regionProps}>
    <OverviewTrendLayout date={selected} day={day} range={range} mobile={mobile} changeRange={changeRange} view={viewSelectedDay} custom={customControls}
      mobileRange={mobile === null && mode === null ? rangeContaining(preferred, today, "7") : undefined}>
      {dates.length ? <RelationshipPlot days={days} selected={selected} selection={selection} compactMode={mobile ?? undefined} {...plotOptions} suspended={detailSuspended}/>
        : <p className={styles.caption}>请选择有效日期范围，最长10年。</p>}
    </OverviewTrendLayout>
    {dialogDay&&<EditorDialog title={dialogDay.date+" · 当日记录"} titleParts={[dialogDay.date,"当日记录"]} stableScroll close={()=>setOpened(null)} busy={false}><OverviewDayDetails day={dialogDay}/></EditorDialog>}
  </section>;
}

function OverviewDayDetails({day}:{day:OverviewDay}){
 return <div className={styles.dayDetails}>
  <div className={styles.detailTop}>
   <section><h3>晨间体重</h3><div className={styles.detailReading}><WeightReading record={day.morning}/></div><p>次晨 {day.nextDate.slice(5)} · {day.nextMorning?formatRecordNumber(day.nextMorning.weightKg)+" kg":"未记录"}{day.weightChangeKg!==null?<b>变化 {signed(day.weightChangeKg)} kg</b>:day.nextMorning?<b>未配对</b>:null}</p><LoadingLink href={"/dashboard/measurements?date="+day.date}>身体记录 →</LoadingLink></section>
   <section><h3>消耗</h3><div className={styles.detailReading}><strong>{energyValue(day.energy.totalKcal)}<small>千卡</small></strong></div><p>静息 {energyValue(day.energy.restingKcal)} · 活动 {energyValue(day.energy.activeKcal)} 千卡</p>{day.energy.record?.calculationSnapshot&&<p>系统估算 · {day.energy.record.calculationSnapshot.method==="cunningham"?"体脂公式":"常规公式"}{day.energy.record.calculationSnapshot.factor?" ×"+day.energy.record.calculationSnapshot.factor:""}</p>}<LoadingLink href={"/dashboard/energy?date="+day.date}>消耗记录 →</LoadingLink></section>
  </div>
  <section className={styles.detailNutrition}>{day.nutrition&&day.mealDayStatus!=="complete"&&<span className={styles.mealDayStatus}>{day.mealDayStatus==='incomplete'?'饮食未记全':'饮食待确认'}</span>}<DayNutritionSummary totals={day.nutrition} partial={day.mealDayStatus!=="complete"}/></section>
  <SavedMealList meals={day.meals} initialLimit={3}/>
  <LoadingLink returnScope="workspace" href={"/dashboard/meals?date="+day.date+(day.meals.length&&day.mealDayStatus!=="complete"?"&intent=edit":"")}>
   {day.meals.length&&day.mealDayStatus!=="complete"?"核对当天饮食 →":"查看饮食记录 →"}
  </LoadingLink>
 </div>;
}
