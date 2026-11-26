"use client";
import {LocalLoading} from "@/components/local-loading";
import {energyDraftSignature,exerciseHasInput} from "./energy-editor-state";
import {energyWebIssue,sameEnergyAmounts,adoptedEnergyAction} from "../records/web-entry";
import {useEffect,useLayoutEffect,useContext,useId,useRef,useState,type ReactNode} from "react";
import {DateField} from "@/components/date-field";
import {confirmAction} from "@/components/confirmation-state";
import {confirmNumbers} from "@/components/number-change";
import {DecimalInput} from "@/components/decimal-input";
import {useDraftGuard} from "@/components/draft-guard";
import {TaskGuide} from "@/components/task-guide";
import {WorkspaceTodayContext} from "@/components/workspace-frame-state";
import {useLocalToday} from "@/components/use-local-today";
import {RecordDateContext} from "@/components/record-date-context";
import {SourceInput,type SourceRemovalResult} from "@/components/source-input";
import {energyRecordingMethod,energySourceLabel,activityCalories,activityCalorieFields,activityReadings,activityEnergyChanged,energyBaseline,energyDays,energyModes,energyValue,type ActivityRecord,type EnergyDayRecord,type EnergyAction} from "./model";
import {activitySummary} from "./activity-summary";
import {activityAccumulationPreview,activityAccumulationMessage} from "./energy-aggregate";
import {loadEnergyCalculationAction} from "@/app/dashboard/energy/actions";
import {calculateEnergy, type CalculationContext, type CalculationMethod, type CalculationRequest, type CalculationSnapshot, type RestingMethod, type ActivityLevel} from "./calculation-model";
import {RestingMethodControl,RestingEstimate,RestingEstimator,CalculationDetails,ActivityEnergyHelp,ActivityLevelControl,ActivityMethodControl,EnergySupplement} from "./energy-calculation";
import {CalculationPopover} from "./calculation-popover";
import {EnergyPreferencesContext} from "./energy-preferences";
import type {EnergyPresentation} from "./presentation";
import glass from "@/components/glass-controls.module.css";
import { useSlidingSelection } from "@/components/sliding-selection";
import styles from "./energy.module.css";
type Choice="included"|"additional";
type ActivityAction=Extract<EnergyAction,{kind:"save_activity"}>;
type ActivityDraft=ActivityAction&{key:string;initialBasis?:string|null;choiceSignature?:string};
type DayAction=Extract<EnergyAction,{kind:"save_energy_day"}>;
type ManualFormat="components"|"total";
const blankProvenance={timezone:"Asia/Shanghai",sourceSystem:null,sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal" as const,syncStatus:"confirmed" as const};
function estimatedDraft(current:DayAction,request:CalculationRequest,context:CalculationContext|null,allowUnknown=false){
 const available=context?.date===current.date?context:null;
 const result=available?calculateEnergy(available,{...request,basisKey:undefined}):null,base=available?calculateEnergy(available,{kind:"resting",method:request.method}):null;
 if(allowUnknown&&request.kind==="resting"&&available&&!result?.ok)return {snapshot:null,action:{...current,restingInputMethod:"manual" as const,calculation:null,entryMode:"components" as const,totalKcal:null,restingKcal:null,restingEstimated:false,restingSourceSystem:null}};
 return {snapshot:result?.ok?result.snapshot:base?.ok?base.snapshot:null,action:{...current,restingInputMethod:"estimate" as const,calculation:{...request,basisKey:base?.ok?base.snapshot.basisKey:undefined},entryMode:request.kind==="daily"?"total" as const:"components" as const,...(request.kind==="daily"?{activityMode:"total" as const,totalKcal:result?.ok?result.snapshot.totalKcal:null,restingKcal:null,activeKcal:null}:{totalKcal:null,restingKcal:result?.ok?result.snapshot.restingKcal:null}),restingEstimated:true,restingSourceSystem:base?.ok?"系统估算 · "+base.snapshot.method:null}};
}
function activityRecord(action:ActivityAction,key:string,prior?:ActivityRecord):ActivityRecord{
 return {...blankProvenance,...prior,...action,...activityCalorieFields(action,prior),id:action.id??key,version:action.version??1,deletedAt:null,durationMinutes:action.durationMinutes===undefined?prior?.durationMinutes??null:action.durationMinutes,completed:action.completed??prior?.completed??true,timezone:action.timezone??prior?.timezone??"Asia/Shanghai"};
}
function itemDraft(row:ActivityRecord):ActivityDraft{
 return {kind:"save_activity",key:row.id,id:row.id,version:row.version,date:row.date,name:row.name,calorieMode:row.calorieMode??undefined,caloriesKcal:row.caloriesKcal,exerciseActiveKcal:row.exerciseActiveKcal,exerciseRestingKcal:row.exerciseRestingKcal,durationMinutes:row.durationMinutes,completed:row.completed,sourceSystem:row.sourceSystem,sourceRecordId:row.sourceRecordId,sourceOccurredAt:row.sourceOccurredAt,timezone:row.timezone,inclusion:row.inclusion,initialBasis:row.inclusionBasis};
}
export function EnergyEditor({initial,activities=[],dayRecords=[],activityPreview,sources,removeSource,busy,error,save,saveBatch,submitLabel="保存",addActivity=false,quickStart=false,stepsEnabled=false,pending=false,onRetry,management,refreshDevice}:{
 quickStart?:boolean;
 refreshDevice?:()=>Promise<{presentation:EnergyPresentation;apply:()=>void}>;
 initial:EnergyAction;pending?:boolean;onRetry?:()=>void;management?:ReactNode;stepsEnabled?:boolean;activities?:ActivityRecord[];dayRecords?:EnergyDayRecord[];activityPreview?:ActivityRecord;sources:string[];removeSource:(label:string)=>Promise<SourceRemovalResult>;busy:boolean;error:string;save:(action:EnergyAction)=>void;saveBatch?:(actions:EnergyAction[])=>void;submitLabel?:string;addActivity?:boolean;
}){
 const numberAcknowledgements=useRef(new Set<string>()),submitting=useRef(false);
 const methodMenu=useRef<HTMLDetailsElement>(null),switchingAggregate=useRef(false),aggregateId=useId();
 const [confirmingAggregate,setConfirmingAggregate]=useState(false);
 useEffect(()=>{
  const dismiss=(event:PointerEvent)=>{if(methodMenu.current&&!methodMenu.current.contains(event.target as Node))methodMenu.current.open=false;};
  document.addEventListener("pointerdown",dismiss);
  return()=>{document.removeEventListener("pointerdown",dismiss);};
 },[]);
 const [openedOn]=useState(()=>new Date().toLocaleDateString("en-CA"));
 const energyPreferences=useContext(EnergyPreferencesContext);
 const workspaceToday=useContext(WorkspaceTodayContext),localToday=useLocalToday(openedOn);
 const today=workspaceToday||localToday;
 const useBlankDefaults=initial.kind==="save_energy_day"&&!initial.id&&submitLabel==="保存"&&initial.calculation===undefined&&initial.restingKcal==null&&initial.activeKcal==null&&initial.totalKcal==null;
 const [draft,setDraft]=useState<EnergyAction>(()=>{
  if(initial.kind==="save_energy_day"&&addActivity){const stored=dayRecords.find(row=>row.id===initial.id),calculation=stored?.calculationSnapshot;if(calculation?.kind==="daily")return {...structuredClone(initial),restingInputMethod:"estimate",entryMode:"components",activityMode:"activities",restingKcal:null,activeKcal:null,totalKcal:null,calculation:{kind:"resting",method:calculation.requestedMethod}};}
  if(initial.kind==="save_energy_day"&&useBlankDefaults&&initial.restingInputMethod===undefined){const preference=energyPreferences.value,manual=preference.restingMethod==="manual"&&!addActivity;return {...structuredClone(initial),restingInputMethod:"estimate",entryMode:addActivity||manual?"components":"total",activityMode:addActivity?"activities":"total",calculation:initial.calculation??{kind:addActivity||manual?"resting":"daily",method:preference.formula}};}
  if(initial.kind!=="save_activity")return structuredClone(initial);
  const row=activityPreview??activities.find(row=>row.id===initial.id);
  return structuredClone(row?{...initial,calorieMode:initial.calorieMode??row.calorieMode??undefined,caloriesKcal:initial.caloriesKcal===undefined?row.caloriesKcal:initial.caloriesKcal,exerciseActiveKcal:initial.exerciseActiveKcal===undefined?row.exerciseActiveKcal:initial.exerciseActiveKcal,exerciseRestingKcal:initial.exerciseRestingKcal===undefined?row.exerciseRestingKcal:initial.exerciseRestingKcal,durationMinutes:initial.durationMinutes===undefined?row.durationMinutes:initial.durationMinutes,sourceSystem:initial.sourceSystem===undefined?row.sourceSystem:initial.sourceSystem,timezone:initial.timezone??row.timezone,completed:initial.completed??row.completed}:initial);
 });
 const daily=draft.kind==="save_energy_day",single=draft.kind==="save_activity";
 const originalActivity=activityPreview??activities.find(row=>"id" in initial&&row.id===initial.id);
 const targetDate="date" in draft?draft.date:originalActivity?.date;
 const sourceDate=initial.kind==="save_energy_day"?initial.date:undefined;
 const day=dayRecords.find(row=>!row.deletedAt&&(daily?(initial.id?row.id===initial.id:row.date===sourceDate):row.date===targetDate));
 const deviceMetadata=day?.date===targetDate?day?.adoption?.metadata:null;
 const deviceUsable=!!deviceMetadata&&(day?.adoption?.mode==="source"||day?.restingInputMethod==="device"&&!day.calculationSnapshot);
 const [recordMode,setRecordMode]=useState<RestingMethod>(()=>{
  if(useBlankDefaults&&initial.kind==="save_energy_day"&&initial.restingInputMethod===undefined)return energyPreferences.value.restingMethod==="manual"&&!addActivity?"manual":"estimate";
  if(initial.kind!=="save_energy_day")return "manual";
  const source=initial.restingInputMethod??(initial.calculation?"estimate":day?.restingInputMethod);
  return energyRecordingMethod({...day,...initial,restingInputMethod:source,calculationSnapshot:initial.calculation?{kind:initial.calculation.kind}:day?.calculationSnapshot});
 });
 const [methodTouched,setMethodTouched]=useState(false);
 const componentDraft=useRef<Extract<EnergyAction,{kind:"save_energy_day"}>|null>(null);
 const [methodDrafts,setMethodDrafts]=useState<Partial<Record<RestingMethod,Extract<EnergyAction,{kind:"save_energy_day"}>>>>({});
 const [manualDrafts,setManualDrafts]=useState<Partial<Record<ManualFormat,DayAction>>>({});
 const [deviceLoading,setDeviceLoading]=useState(false),[deviceError,setDeviceError]=useState("");
 async function readAdoptedDevice(){
  if(!refreshDevice||!daily||deviceLoading)return;setDeviceLoading(true);setDeviceError("");
  try{
   if(draft.id&&sourceDate!==draft.date)throw new Error("请先返回原日期读取设备值；改期仍需单独核对。");
   const fresh=await refreshDevice(),record=fresh.presentation.snapshot.days.find(row=>!row.deletedAt&&row.date===draft.date);
   if(!record?.adoption?.metadata||record.adoption.mode!=="source")throw new Error("这一天还没有采用中的设备记录，请先在设备页面完成采用。");
   if(!await confirmAction({title:"采用已同步设备值？",message:`${draft.date} · ${record.adoption.metadata.label}\n静息 ${energyValue(record.adoption.metadata.restingKcal)} · 活动 ${energyValue(record.adoption.metadata.activeKcal)} · 全天 ${energyValue(record.totalKcal)} 千卡\n采用后保留本次备注和未保存运动草稿，数值、版本与日期以本次设备记录为准。`,confirmLabel:"采用设备值"}))return;
   fresh.apply();setPreviewSnapshot(null);setRecordMode("device");
   setDraft(current=>current.kind!=="save_energy_day"?current:{...current,id:record.id,version:record.version,entryMode:energyModes(record).entryMode,activityMode:energyModes(record).activityMode,restingKcal:record.restingKcal,activeKcal:record.activeKcal,totalKcal:record.totalKcal,steps:current.steps??record.steps,restingInputMethod:"device",calculation:null,restingEstimated:record.restingEstimated,activeEstimated:record.activeEstimated,sourceSystem:record.sourceSystem,restingSourceSystem:record.restingSourceSystem,activeSourceSystem:record.activeSourceSystem});
   setItems(current=>[...current,...fresh.presentation.snapshot.activities.filter(row=>!row.deletedAt&&row.date===draft.date&&!current.some(item=>item.id===row.id)).map(itemDraft)]);setMethodTouched(true);setAggregateEpoch(epoch=>epoch+1);
  }catch(error){setDeviceError(error instanceof Error?error.message:"暂时无法读取设备值，当前草稿保留。");}finally{setDeviceLoading(false);}
 }
 const [context,setContext]=useState<CalculationContext|null>(null),[contextBusy,setContextLoading]=useState(false),[contextError,setContextError]=useState(""),[contextEpoch,setContextEpoch]=useState(0);
 const contextLoading=contextBusy||daily&&!pending&&context?.date!==targetDate&&!contextError;
 const [supplement,setSupplement]=useState<"profile"|"body"|null>(null),[estimatorOpen,setEstimatorOpen]=useState(false),[resumeEstimator,setResumeEstimator]=useState(false);
 const restingId=useId(),totalId=useId();
 const quick=daily&&(draft.calculation?.kind==="daily"||draft.calculation===undefined&&day?.calculationSnapshot?.kind==="daily");

 const restingMethod:RestingMethod=daily?draft.restingInputMethod??(draft.calculation?"estimate":day?.restingInputMethod??(day?.adoption?.mode==="source"?"device":"manual")):"manual";
 const manualFormat:ManualFormat=daily&&(draft.entryMode==="total"||draft.entryMode===undefined&&day?.entryMode==="total")?"total":"components";
 const formula:CalculationMethod=daily?draft.calculation?.method??day?.calculationSnapshot?.requestedMethod??context?.preferences.formula??"auto":"auto";
 const requested=daily?draft.calculation:null;
 const [previewSnapshot,setPreviewSnapshot]=useState<CalculationSnapshot|null>(day?.calculationSnapshot??null);
 const calculated=requested&&context&&context.date===targetDate?calculateEnergy(context,requested):null;
 const calculationSnapshot:CalculationSnapshot|null=calculated?.ok?calculated.snapshot:daily&&draft.calculation===undefined&&restingMethod==="estimate"?day?.calculationSnapshot??null:null;
 const baseCalculation=restingMethod==="estimate"&&context&&context.date===targetDate?calculateEnergy(context,{kind:"resting",method:formula}):null;
 const restingSnapshot=calculationSnapshot??previewSnapshot??(baseCalculation?.ok?baseCalculation.snapshot:null);
 function estimate(request:CalculationRequest,nextContext=context,allowUnknown=recordMode==="manual"){
  if(!daily)return;setPreviewSnapshot(estimatedDraft(draft,request,nextContext,allowUnknown).snapshot);
  setDraft(current=>current.kind!=="save_energy_day"?current:estimatedDraft(current,request,nextContext,allowUnknown).action);
 }
 useEffect(()=>{
  if(!daily||!targetDate||pending)return;
  let active=true;
  void loadEnergyCalculationAction(targetDate).then(result=>{
   if(!active)return;
   if(!result.ok){setContextError(result.error);return;}
   setContext(result.data);
   energyPreferences.update(result.data.preferences);
   setDraft(current=>current.kind!=="save_energy_day"||current.date!==result.data.date||current.restingInputMethod==="manual"||current.restingInputMethod==="device"||!current.calculation||current.calculation.basisKey?current:estimatedDraft(current,current.calculation,result.data,recordMode==="manual").action);
  }).catch(()=>{if(active)setContextError("暂时无法读取计算依据，请重试。");}).finally(()=>{if(active)setContextLoading(false);});
  return()=>{active=false;};
  // 日期及补填返回独立读取；保存前服务器仍会核对同一依据。
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[daily,targetDate,pending,contextEpoch,methodTouched,recordMode]);
 async function recalculate(){
  if(!targetDate||contextLoading)return;setContextLoading(true);setContextError("");
  try{const result=await loadEnergyCalculationAction(targetDate);if(!result.ok){setContextError(result.error);return;}setContext(result.data);estimate({kind:quick?"daily":"resting",method:formula,...(quick?{activityLevel:requested?.activityLevel??calculationSnapshot?.activityLevel??undefined}:{})},result.data);}catch{setContextError("暂时无法重新计算，原输入已保留。");}finally{setContextLoading(false);}
 }
 function changeMethod(method:RestingMethod){
  if(!daily||method===recordMode)return;setEstimatorOpen(false);setMethodTouched(true);setMethodDrafts(current=>({...current,[recordMode]:structuredClone(draft)}));setRecordMode(method);
  const previous=methodDrafts[method];
  if(previous&&method!=="device"){
   setDraft(current=>current.kind!=="save_energy_day"?current:{...previous,id:current.id,version:current.version,date:current.date,notes:current.notes,steps:current.steps,timezone:current.timezone});
   if(previous.restingInputMethod==="estimate"&&previous.date!==targetDate)estimate({kind:previous.calculation?.kind??day?.calculationSnapshot?.kind??"resting",method:previous.calculation?.method??day?.calculationSnapshot?.requestedMethod??formula},context,method==="manual");
  }else if(method==="estimate"){
   const details=addActivity||items.some(exerciseHasInput);
   setDraft(current=>({...current,activityMode:details?"activities":"total",activeKcal:null}));
   estimate({kind:details?"resting":"daily",method:formula},context,false);
  }else if(method==="manual"){
   setDraft(current=>({...current,activityMode:"total",activeKcal:null,activeEstimated:false,activeSourceSystem:null,sourceSystem:null,sourceRecordId:null,sourceOccurredAt:null}));
   estimate({kind:"resting",method:formula},context,true);
  }else {
   setPreviewSnapshot(null);setDraft(current=>current.kind!=="save_energy_day"?current:{...current,entryMode:"components",activityMode:"total",restingKcal:null,activeKcal:null,totalKcal:null,restingInputMethod:method,calculation:null,restingEstimated:false,activeEstimated:false,restingSourceSystem:method==="device"?day?.sourceSystem??null:null,activeSourceSystem:method==="device"?day?.sourceSystem??null:null,...(method==="device"?{...energyModes(day),restingKcal:deviceUsable?day?.restingKcal??null:null,activeKcal:deviceUsable?day?.activeKcal??null:null,totalKcal:deviceUsable?day?.totalKcal??null:null}: {})});
  }
  setAggregateEpoch(epoch=>epoch+1);
 }
 function changeManualFormat(format:ManualFormat){
  if(!daily||format===manualFormat||switchingAggregate.current)return;
  setMethodTouched(true);setEstimatorOpen(false);setManualDrafts(values=>({...values,[manualFormat]:structuredClone(draft)}));
  const previous=manualDrafts[format];
  setDraft(current=>current.kind!=="save_energy_day"?current:{...current,...previous,id:current.id,version:current.version,date:current.date,notes:current.notes,steps:current.steps,timezone:current.timezone,entryMode:format,activityMode:previous?.activityMode??"total",restingInputMethod:format==="total"?"manual":previous?.restingInputMethod??"estimate",calculation:format==="total"?null:previous?.calculation,restingKcal:format==="components"?previous?.restingKcal??null:null,totalKcal:format==="total"?previous?.totalKcal??null:null,activeKcal:format==="components"?previous?.activeKcal??null:null,restingEstimated:format==="components"&&previous?.restingEstimated===true,restingSourceSystem:format==="components"?previous?.restingSourceSystem??null:null,sourceSystem:format==="total"?previous?.sourceSystem??null:null,sourceRecordId:null,sourceOccurredAt:null});
  if(format==="components"&&(!previous||previous.restingInputMethod==="estimate"&&previous.date!==targetDate))estimate({kind:"resting",method:previous?.calculation?.method??formula},context,true);
  setPreviewSnapshot(null);setAggregateEpoch(epoch=>epoch+1);
 }
 function openRestingEstimator(){setEstimatorOpen(true);setContextError("");setContextLoading(true);setContextEpoch(epoch=>epoch+1);}
 function enterQuick(){if(!daily||quick)return;componentDraft.current=structuredClone(draft);setMethodTouched(true);estimate({kind:"daily",method:formula});setAggregateEpoch(epoch=>epoch+1);}
 function leaveQuick(){
  if(!daily||!quick)return;setMethodTouched(true);const previous=componentDraft.current;
  if(previous&&previous.calculation?.kind!=="daily"){
   setDraft(current=>current.kind!=="save_energy_day"?current:{...previous,id:current.id,version:current.version,date:current.date,notes:current.notes,steps:current.steps,timezone:current.timezone,sourceSystem:current.sourceSystem,sourceRecordId:current.sourceRecordId,sourceOccurredAt:current.sourceOccurredAt});
   if(previous.date!==targetDate&&previous.restingInputMethod==="estimate")estimate({kind:"resting",method:previous.calculation?.method??day?.calculationSnapshot?.requestedMethod??formula});
  }else {estimate({kind:"resting",method:formula});setDraft(current=>({...current,activityMode:"activities",activeKcal:null}));}
  setAggregateEpoch(epoch=>epoch+1);
 }
 const [items,setItems]=useState<ActivityDraft[]>(()=>[...activities.filter(row=>!row.deletedAt&&initial.kind==="save_energy_day"&&row.date===initial.date).map(itemDraft),...(addActivity&&initial.kind==="save_energy_day"?[{key:"new-activity",kind:"save_activity" as const,date:initial.date,name:"",calorieMode:"total" as const,completed:true,timezone:initial.timezone}]:[])]);
 const form=useRef<HTMLFormElement>(null);
 useLayoutEffect(()=>{const node=form.current,footer=node?.querySelector<HTMLElement>('[data-entry-footer]'),dialog=node?.closest('dialog');if(!footer||!dialog)return;const update=()=>dialog.style.setProperty('--entry-footer-height',footer.getBoundingClientRect().height+'px');update();const observer=new ResizeObserver(update);observer.observe(footer);return()=>{observer.disconnect();dialog.style.removeProperty('--entry-footer-height');};},[]);
 useEffect(()=>{if(!addActivity)return;const timer=setTimeout(()=>{const input=form.current?.querySelector<HTMLInputElement>('[data-new-activity] input');input?.scrollIntoView({block:"nearest",behavior:"smooth"});input?.focus({preventScroll:true});},300);return()=>clearTimeout(timer);},[addActivity]);
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set(addActivity?["new-activity"]:items.length?[items[0].key]:[]));
 const [adjusting,setAdjusting]=useState<Set<string>>(new Set());
 const [aggregateEditing,setAggregateEditing]=useState(false),[aggregateEpoch,setAggregateEpoch]=useState(0);
 const originalBaseline=energyBaseline(day);
 const modes=daily?energyModes({...draft,totalKcal:draft.totalKcal??null,activeKcal:draft.activeKcal??null,activityMode:draft.activityMode??(draft.activeKcal!=null?"total":"activities")}):energyModes(day);
 const emptyDetails=daily&&!quick&&modes.activityMode==="activities"&&!items.some(item=>item.name.trim()&&item.completed!==false)&&day?.activityMode!=="activities";
 const projected:EnergyDayRecord|null=targetDate?daily?{
  ...blankProvenance,...day,id:draft.id??day?.id??"draft:"+targetDate,version:draft.version??day?.version??1,deletedAt:null,date:targetDate,
  entryMode:modes.entryMode,activityMode:emptyDetails?"total":modes.activityMode,restingKcal:draft.restingKcal??null,activeKcal:emptyDetails?null:draft.activeKcal??null,totalKcal:draft.totalKcal??null,
  timezone:draft.timezone??day?.timezone??"Asia/Shanghai"
 }:day??{...blankProvenance,id:"draft:"+targetDate,version:1,deletedAt:null,date:targetDate,entryMode:"components",activityMode:"activities",restingKcal:null,activeKcal:null,totalKcal:null}:null;
 const baseline=energyBaseline(projected);
 const relationKey=(action:ActivityAction)=>JSON.stringify([baseline,aggregateEpoch,action.date,activityCalories(activityCalorieFields(action)),action.completed??true]);
 const initialSingleChoice=single&&draft.inclusion&&originalActivity?.inclusionBasis===baseline?draft.inclusion:originalActivity?.inclusionBasis===baseline?originalActivity?.inclusion??null:null;
 const [singleChoice,setSingleChoice]=useState<{signature:string;value:Choice|null}>(()=>({signature:single?relationKey(draft):"",value:initialSingleChoice}));
 function changed(item:ActivityDraft){const before=activities.find(row=>row.id===item.id);return !before||activityEnergyChanged(before,activityRecord(item,item.key,before));}
 function relation(item:ActivityDraft):Choice|null{
  if(quick&&baseline)return "included";
  if(!baseline)return null;
  if(item.choiceSignature===relationKey(item))return item.inclusion??null;
  return aggregateEpoch===0&&baseline===originalBaseline&&!changed(item)&&item.initialBasis===baseline?item.inclusion??null:null;
 }
 const relevant=items.filter(item=>item.name.trim()&&item.completed!==false);
 const needsReview=(item:ActivityDraft)=>!!baseline&&(aggregateEpoch>0||baseline!==originalBaseline||changed(item)||!!item.inclusion&&item.initialBasis!==baseline);
 const unresolved=baseline&&!quick?relevant.filter(item=>needsReview(item)&&!relation(item)):[];
 const singleChanged=single&&(!originalActivity||activityEnergyChanged(originalActivity,activityRecord(draft,"single",originalActivity)));
 const selectedRelation=single&&singleChoice.signature===relationKey(draft)?singleChoice.value:null;
 const singleRequires=!!baseline&&single&&draft.completed!==false&&(singleChanged||!selectedRelation);
 const projectedItems:ActivityRecord[]=daily?quick?activities.filter(row=>!row.deletedAt&&row.date===sourceDate).map(row=>({...row,date:targetDate!,inclusion:"included",inclusionBasis:baseline})):items.filter(item=>item.name.trim()).map(item=>({...activityRecord({...item,date:targetDate!},item.key,activities.find(row=>row.id===item.id)),inclusion:relation(item),inclusionBasis:relation(item)?baseline:null})):activities.filter(row=>!row.deletedAt&&row.date===targetDate&&(!single||row.id!==(draft.id??originalActivity?.id)));
 if(single)projectedItems.push({...activityRecord(draft,"single",originalActivity),inclusion:selectedRelation,inclusionBasis:selectedRelation?baseline:null});
 const accumulation=projected?activityAccumulationPreview(projected,projectedItems):null;
 const autoActive=accumulation?.activeKcal??null;
 const unresolvedCount=daily?unresolved.length:singleRequires&&!selectedRelation?1:0;
 const dayPreview=projected?energyDays({days:[projected],activities:projectedItems,profiles:[]},[],[projected.date])[0]:null;
 const total=unresolvedCount?null:dayPreview?.totalKcal??null;
 const signature=energyDraftSignature(single?{...draft,inclusion:selectedRelation}:draft,items),[firstSignature]=useState(signature);
 // 来源、备注等共用字段恢复时取当前输入；只比较仍可恢复的非当前方式草稿。
 const cachedManualFormat=recordMode==="manual"?manualFormat:methodDrafts.manual?.entryMode??"components";
 const hiddenDrafts=[...Object.entries(methodDrafts).filter(([method])=>method!==recordMode&&method!=="device").map(([,value])=>value),...Object.entries(manualDrafts).filter(([format])=>format!==cachedManualFormat).map(([,value])=>value)];
 const hiddenMethodDirty=daily&&hiddenDrafts.some(value=>energyDraftSignature({...value,date:draft.date,notes:draft.notes,steps:draft.steps,timezone:draft.timezone},items)!==firstSignature);
 useDraftGuard(signature!==firstSignature||hiddenMethodDirty,busy);
 const set=(key:string,value:unknown)=>{setDraft(current=>({...current,[key]:value,...(key==="date"&&current.kind==="save_energy_day"&&restingMethod==="estimate"?{calculation:{kind:quick?"daily":"resting",method:formula},restingKcal:null,totalKcal:null,entryMode:quick?"total":"components"}:{}),...(key==="restingKcal"?{restingEstimated:false}:key==="activeKcal"?{activeEstimated:false}:{}),...(key.endsWith("SourceSystem")||key==="sourceSystem"?{sourceRecordId:null}:{})}));if(key==="date"){setPreviewSnapshot(null);setContextError("");}};
 function aggregate(value:string){
  if(!daily||switchingAggregate.current)return;
  const next=value||null;
  if(modes.activityMode!=="total"||draft.activeKcal!==next)setAggregateEpoch(epoch=>epoch+1);
  // 清空保持未知；只有明确选择高级入口才改为运动累计。
  setDraft(current=>({...current,activeKcal:next,activityMode:"total",activeEstimated:false}));
 }
 async function requestActivityAccumulation(){
  if(!daily||!projected||!accumulation||modes.activityMode!=="total"||switchingAggregate.current)return;
  switchingAggregate.current=true;setConfirmingAggregate(true);
  if(methodMenu.current)methodMenu.current.open=false;
  try{
   const confirmed=await confirmAction({title:"改用运动明细相加？",message:activityAccumulationMessage(projected.activeKcal,total,accumulation,submitLabel==="应用修改"),confirmLabel:"确认切换"});
   if(confirmed){
    // 未采用的手填数值和来源仍留在各自草稿中，切回手填时可恢复。
    setDraft(current=>({...current,activityMode:"activities"}));
    setAggregateEpoch(epoch=>epoch+1);
    setAdjusting(new Set());
   }
  }finally{
   setAggregateEditing(false);
   switchingAggregate.current=false;setConfirmingAggregate(false);
  }
 }
 function restoreManualAggregate(){
  if(!daily||switchingAggregate.current)return;
  if(methodMenu.current)methodMenu.current.open=false;
  setAggregateEditing(false);
  setDraft(current=>({...current,activityMode:"total"}));setAggregateEpoch(epoch=>epoch+1);
 }
 function aggregateFinished(){
  setAggregateEditing(false);if(unresolved[0])setExpanded(values=>new Set([...values,unresolved[0].key]));
 }
 function choose(item:ActivityDraft,value:Choice){setItems(rows=>rows.map(row=>row.key===item.key?{...row,inclusion:value,choiceSignature:relationKey(row)}:row));setAdjusting(keys=>new Set([...keys].filter(key=>key!==item.key)));}
 function relationButtons(value:Choice|null,onChoose:(choice:Choice)=>void,label:string){return <div className={styles.inclusion} role="group" aria-label={label}><span>这项运动是否已包含在当天{modes.entryMode==="total"?"总消耗":"活动合计"} {energyValue(modes.entryMode==="total"?projected?.totalKcal:projected?.activeKcal)} 千卡中？</span><div>{([["included","已包含"],["additional","额外增加"]] as const).map(([choice,text])=><button key={choice} type="button" aria-pressed={value===choice} onClick={()=>onChoose(choice)}>{text}</button>)}</div></div>;}
 const source=(key:"sourceSystem"|"restingSourceSystem"|"activeSourceSystem",label:string)=><SourceInput label={label} value={energySourceLabel(key in draft?(draft as Record<string,unknown>)[key] as string??"":key!=="sourceSystem"&&"sourceSystem" in draft?draft.sourceSystem??"":"")} sources={sources} removeSource={removeSource} disabled={busy} maxLength={200} onChange={value=>set(key,value||null)}/>;
 const field=(key:"restingKcal"|"totalKcal",label:string)=>{const id=key==="restingKcal"?restingId:totalId;return <div className={styles.manualReading}><div className={styles.manualReadingHeading}><label htmlFor={id}>{label.replace(" 千卡","")} <span className={styles.unit}>千卡</span></label>{key==="restingKcal"&&<><CalculationDetails snapshot={restingMethod==="estimate"?restingSnapshot:null}/><CalculationPopover label="估算" title="静息估算" open={estimatorOpen} changeOpen={setEstimatorOpen} onOpen={openRestingEstimator} disabled={busy||pending||retired||confirmingAggregate} triggerClassName={styles.estimateEntry} wide><RestingEstimator key={formula} context={context?.date===targetDate?context:null} value={formula} loading={contextLoading} error={contextError} supplement={kind=>{setResumeEstimator(true);setEstimatorOpen(false);setSupplement(kind);}} apply={method=>{setMethodTouched(true);estimate({kind:"resting",method});setEstimatorOpen(false);setAggregateEpoch(epoch=>epoch+1);}}/></CalculationPopover></>}</div><DecimalInput id={id} precision={0} min={0} max={1000000} aria-label={label} placeholder="未知" value={key in draft?(draft as Record<string,unknown>)[key] as string:null} onFocus={()=>key==="totalKcal"&&setAggregateEditing(true)} onBlur={aggregateFinished} onValue={value=>{setAggregateEpoch(epoch=>epoch+1);if(key==="restingKcal"){setPreviewSnapshot(null);setDraft(current=>({...current,restingKcal:value||null,restingInputMethod:"manual",calculation:null,restingEstimated:false,restingSourceSystem:null,sourceRecordId:null}));}else set(key,value||null);}}/></div>;};
 const activityField=daily?<div className={styles.manualReading}><div className={styles.manualReadingHeading}><label htmlFor={aggregateId}>活动 <span className={styles.unit}>千卡</span></label><ActivityEnergyHelp/></div><DecimalInput id={aggregateId} precision={0} aria-label="活动合计 · 千卡" min={0} max={1000000} readOnly={modes.activityMode==="activities"} data-calorie-origin={modes.activityMode==="activities"?"automatic":"manual"} value={pending?"":emptyDetails?null:modes.activityMode==="activities"?autoActive:draft.activeKcal} placeholder="未知" onFocus={()=>setAggregateEditing(true)} onBlur={aggregateFinished} onValue={aggregate}/></div>:null;
 async function submit(){
  if(submitting.current||busy||switchingAggregate.current||entryIssue)return;submitting.current=true;
  try{
   if(single){
    if(singleRequires&&!selectedRelation)return;
    if(!await confirmNumbers([{label:"本次运动",unit:"kcal",value:activityCalories(activityCalorieFields(draft)),previous:originalActivity?activityCalories(originalActivity):undefined}],numberAcknowledgements.current))return;
    save({...draft,...(baseline&&selectedRelation?{inclusion:selectedRelation}:{})});return;
   }
   if(!daily){save(draft);return;}
   if(saveBatch&&unresolved.length)return;
   if(!await confirmNumbers((["restingKcal","activeKcal","totalKcal"] as const).map(key=>({label:key==="restingKcal"?"静息":key==="activeKcal"?"活动合计":"总消耗",unit:"kcal",value:key==="activeKcal"&&modes.activityMode==="activities"?autoActive:draft[key],previous:day?.[key]})),numberAcknowledgements.current))return;
   const dayAction:EnergyAction=adoptedEnergyAction({...draft,...modes,...(emptyDetails?{activityMode:"total",activeKcal:null}:{})});
   if(!saveBatch){save(dayAction);return;}
   const changes:EnergyAction[]=[dayAction];
   if(quick){
    const stored=activities.filter(row=>!row.deletedAt&&row.date===sourceDate),affected=stored.filter(row=>row.date!==draft.date||row.inclusion!=="included"||row.inclusionBasis!==baseline);
    const unused=items.some(item=>exerciseHasInput(item)&&(!item.id||changed(item)));
    if((affected.length||unused)&&!await confirmAction({title:"采用活动量估算全天？",message:(sourceDate!==draft.date?`${sourceDate} → ${draft.date}\n日记录与已有运动一起移动。\n`:"")+"原有 "+stored.length+" 项运动明细会保留，本次全天估算已包含活动，不再额外相加。未保存的运动明细草稿不会随本次估算提交。",confirmLabel:"确认并保存估算"}))return;
    changes.push(...affected.map(row=>({kind:"save_activity" as const,id:row.id,version:row.version,date:draft.date,name:row.name,inclusion:"included" as const})));
    saveBatch(changes);return;
   }
   for(const item of items){const {key,initialBasis,choiceSignature,inclusion,...action}=item;void key;void initialBasis;void choiceSignature;void inclusion;const choice=relation(item);changes.push({...action,date:draft.date,...(baseline&&choice?{inclusion:choice}:{})});}
   for(const row of activities.filter(row=>!row.deletedAt&&row.date===(initial.kind==="save_energy_day"?initial.date:draft.date)&&!items.some(item=>item.id===row.id)))changes.push({kind:"delete_activity",id:row.id,version:row.version});
   const removed=changes.filter(action=>action.kind==="delete_activity");
   if(removed.length&&!await confirmAction({title:"删除已移除的运动？",message:"保存后将永久删除 "+removed.length+" 条已记录运动，其他记录保留。",confirmLabel:"确认删除并保存",danger:true}))return;
   const moving=sourceDate!==draft.date?items.filter(item=>item.id&&item.name.trim()):[];
   if(moving.length&&!await confirmAction({title:"一起更正记录日期？",message:`${sourceDate} → ${draft.date}\n每日汇总和以下 ${moving.length} 项运动一起移动：\n${moving.map(item=>item.name).join("\n")}\n目标日期已有记录时不会合并或覆盖。`,confirmLabel:"确认改期并保存"}))return;
   saveBatch(changes);
  }finally{submitting.current=false;}
 }
 const incompleteExercise=!quick&&items.find(item=>exerciseHasInput(item)&&!item.name.trim());
 const calculationIssue=daily&&restingMethod==="estimate"?(contextError||calculated&&!calculated.ok?contextError||(!calculated?.ok?calculated?.message:""):!calculationSnapshot?contextLoading?"正在读取计算依据…":"请选择公式并重新计算。":""):daily&&restingMethod==="device"&&!deviceUsable?"这一天还没有采用设备静息数据。":"";
 const entryIssue=calculationIssue|| (incompleteExercise?"请填写运动名称。":energyWebIssue(draft,autoActive,!!day&&!!projected&&draft.kind==="save_energy_day"&&initial.kind==="save_energy_day"&&sameEnergyAmounts(projected,day)&&items.every(item=>!changed(item))&&items.length===activities.filter(row=>!row.deletedAt&&row.date===sourceDate).length));
 const retired=draft.kind.includes("energy_defaults")||draft.kind.includes("energy_profile"),blocked=pending||!!entryIssue||busy||confirmingAggregate||retired||!!(saveBatch&&daily&&unresolvedCount)||!!(singleRequires&&!selectedRelation);
 const missing= modes.entryMode==="total"&&projected?.totalKcal==null?"还没填当天总数":modes.entryMode==="components"&&projected?.restingKcal==null?"还没填当天静息":modes.activityMode==="total"&&projected?.activeKcal==null?"还没填活动合计":"有运动热量未知";
 const saveLabel=busy?submitLabel==="应用修改"?"正在应用…":"正在保存…":submitLabel;
 const fast=quickStart&&quick;
 const missingFacts=calculated&&!calculated.ok?calculated.missing:[];
 const supplementKind=missingFacts.includes("profile")?"profile":missingFacts.includes("weight")||missingFacts.includes("bodyFat")?"body":null;
 const supplementLabel=supplementKind==="profile"?"补填个人资料":"补填身体记录";
 const activityLevel=calculationSnapshot?.activityLevel??(requested?.activityLevel as ActivityLevel)??null;
 const activityControl=<ActivityLevelControl dateLabel={targetDate===today?"今天的活动量":"所选日的活动量"} value={activityLevel} change={activityLevel=>{setMethodTouched(true);estimate({kind:"daily",method:formula,activityLevel});setAggregateEpoch(epoch=>epoch+1);}}/>;
 const guideSteps = fast ? [
   ...(!activityLevel?[{target:"energy-activity",text:"选最接近当天实际情况的活动量。日常活动和训练都算在内。"}]:[]),
   {target:"energy-supplement",text:"点「"+supplementLabel+"」。补完会回到这个日期和活动量。"},
   {target:"energy-save",text:"核对底部预计的全天消耗，再点「"+submitLabel+"」。"},
 ] : [
   {target:"energy-save",text:"核对当天记录后，点「"+submitLabel+"」。"},
   {target:"energy-manual-entry",text:"填写所选日期已知的全天热量或分项消耗。"},
 ];
 const formulaControls=<RestingEstimate disabled={busy||pending||retired||confirmingAggregate} value={formula} change={method=>{
  setMethodTouched(true);
  estimate({kind:quick?"daily":"resting",method,...(quick?{activityLevel:requested?.activityLevel??calculationSnapshot?.activityLevel??undefined}:{})});
  setAggregateEpoch(epoch=>epoch+1);
 }} snapshot={fast?(calculationSnapshot??restingSnapshot):restingSnapshot} inlineBasis={fast} recalculate={()=>void recalculate()} loading={contextLoading}
  message={fast?"":contextError||(missingFacts.length&&calculated&&!calculated.ok?calculated.message:"")} missing={missingFacts} supplement={setSupplement}/>;
 function addItem(){if(!daily)return;if(!quick&&modes.activityMode==="total"&&draft.activeKcal==null){setDraft(current=>({...current,activityMode:"activities"}));setAggregateEpoch(epoch=>epoch+1);}const key=crypto.randomUUID();setItems(rows=>[...rows,{key,kind:"save_activity",date:draft.date,name:"",calorieMode:"total",completed:true,timezone:draft.timezone}]);setExpanded(values=>new Set([...values,key]));}
 return <><form hidden={!!supplement} ref={form} data-entry-form={pending?"energy-pending":"energy"} data-energy-entry-layout={daily?"daily":"activity"} className={styles.form+" "+styles.energyEntry} aria-busy={busy||pending&&!error} onSubmit={event=>{event.preventDefault();void submit();}}>

  <fieldset disabled={busy||pending||retired||confirmingAggregate}>
   {(daily||single)&&<div className={styles.entryDate}><label>{daily?<span className="sr-only">日期</span>:"日期"}<DateField aria-label="日期" displayLabel={daily?draft.date.replaceAll("-",".")+(draft.date===today?" · 今天":draft.date<today?" · 补录":""):undefined} required value={draft.date} onChange={event=>{setMethodTouched(true);set("date",event.target.value);}}/></label>{daily&&!pending&&!retired&&<TaskGuide task="energy" video="energy" steps={guideSteps} auto={fast&&!busy}/>}{targetDate&&(!daily?<RecordDateContext statusOnly date={targetDate} openedOn={openedOn}/>:today!==openedOn?<p className={styles.dateNotice} role="status">已跨零点，这份记录仍保存到 {targetDate}</p>:null)}</div>}
   {retired?<p role="alert">日常默认值和静息公式资料已停用，请取消这一项。</p>:daily||single?<>
   <section className={styles.entrySection}>{!daily&&<h3>{modes.entryMode==="total"?"总消耗":"静息与活动"}</h3>}
    {daily?<>
     {fast&&<>{activityControl}<details className={styles.energyDetails}><summary>估算依据</summary>{formulaControls}</details></>}
     {fast?<details className={styles.energyDetails}><summary>其他填写方式</summary><RestingMethodControl value={recordMode} change={changeMethod}/><ActivityMethodControl quick={quick} change={value=>value?enterQuick():leaveQuick()}/></details>:<RestingMethodControl value={recordMode} change={changeMethod}/>}
     {recordMode==="manual"&&<>
      <div className={styles.manualEntryHeading}><span>{manualFormat==="total"?"全天总数":"静息与活动"}</span><button type="button" onClick={()=>changeManualFormat(manualFormat==="total"?"components":"total")}>{manualFormat==="total"?"分开填写":"只有总数？"}</button></div>
      <div className={styles.primaryReadings} data-guide-target="energy-manual-entry">{modes.entryMode==="components"?<>{field("restingKcal","静息 千卡")}{activityField}</>:field("totalKcal","全天总消耗 千卡")}</div>

     </>}
     {restingMethod==="device"&&<>{deviceUsable&&<p className={styles.deviceFactStatus}>{dayPreview?.cumulative?"设备当前累计":"已采用的设备热量"}</p>}<div className={styles.deviceReadings} role="group" aria-label="设备热量">{(deviceUsable&&(deviceMetadata?.restingKcal!=null||deviceMetadata?.activeKcal!=null)?[["resting",deviceMetadata.restingKcal,"静息消耗"],["active",deviceMetadata.activeKcal,"活动消耗"]]:[["total",deviceUsable?draft.totalKcal:null,"总消耗"]]).map(([key,value,label])=><div key={key} data-device-reading={key}><span>{label}</span><strong><span data-energy-value>{energyValue(value)}</span> <small>千卡</small></strong></div>)}</div></>}
     {recordMode==="estimate"&&restingMethod==="estimate"&&!fast&&formulaControls}
     {recordMode==="estimate"&&!fast&&<ActivityMethodControl quick={quick} change={value=>value?enterQuick():leaveQuick()}/>}
     {quick&&!fast&&activityControl}
     {quick&&activities.some(row=>!row.deletedAt&&row.date===sourceDate)&&<p className={styles.hint}>已保存运动明细保留，本次估算不另加。选择“运动明细”可查看和编辑。</p>}
     {restingMethod==="device"&&<div className={styles.deviceControls}>{!deviceUsable&&<p>这一天还没有采用中的设备数据。<a href="/dashboard/sources" target="_blank" rel="noreferrer">连接或采用设备记录</a></p>}{refreshDevice&&<button type="button" disabled={deviceLoading} onClick={()=>void readAdoptedDevice()}>{deviceLoading?"正在读取…":"读取已采用设备值"}</button>}{deviceError&&<p role="alert">{deviceError}</p>}</div>}
     <details className={styles.energyDetails}><summary>来源与备注</summary><div className={styles.fields}>{modes.entryMode==="components"?<>{source("restingSourceSystem","静息来源")}{source("activeSourceSystem","活动来源")}</>:source("sourceSystem","总消耗来源")}</div><label className={styles.notesField}>备注<textarea aria-label="消耗备注" maxLength={2000} rows={2} value={draft.notes??""} onChange={event=>set("notes",event.target.value||null)}/></label><label className={styles.entryTimezone}>时区<input aria-label="时区" maxLength={100} value={draft.timezone??""} onChange={event=>set("timezone",event.target.value)}/></label>{modes.entryMode==="components"&&restingMethod!=="device"&&<details ref={methodMenu} className={styles.energyDetails}><summary>活动填写方式 · {modes.activityMode==="total"?"手填":"运动累计"}</summary><div className={styles.advancedMethod}>{modes.activityMode==="total"?<button type="button" onClick={()=>void requestActivityAccumulation()}>改用运动累计</button>:<button type="button" onClick={restoreManualAggregate}>改为手填活动合计</button>}{modes.activityMode==="activities"&&<p className={styles.aggregateHint}>{accumulation?.activities.length?"由"+accumulation.activities.length+"项运动相加":"暂无运动明细"}</p>}</div></details>}</details>

    </>:<div className={styles.contextReadings}><div><span>静息 千卡</span><strong>{energyValue(day?.restingKcal)}</strong></div><div><span>{modes.entryMode==="total"?"录入总数":"活动合计"} · 千卡</span><strong>{energyValue(modes.entryMode==="total"?day?.totalKcal:modes.activityMode==="total"?day?.activeKcal:autoActive)}</strong></div></div>}
   </section>
   {daily&&stepsEnabled&&<section className={styles.entrySection+" "+styles.stepsSection}><label className={styles.stepsRow}><span>当天步数</span><input aria-label="当天步数" type="number" min={0} max={10000000} step={1} inputMode="numeric" value={draft.steps??""} onChange={event=>set("steps",event.target.value===""?null:Number(event.target.value))}/></label>{day?.adoption?.mode==="source"&&<p className={styles.hint}>修改消耗、步数或运动后，这一天会转为手动保护。</p>}</section>}
   {!quick&&<section className={styles.entrySection+" "+styles.exerciseSection}><div className={styles.exerciseHeader}><div className={styles.exerciseTitle}><h3>运动明细{(pending||!daily||items.length>0)&&<> <small>{pending?"—":daily?items.length:"1"}项</small></>}</h3>{unresolvedCount>0&&<span className={styles.pendingBadge}>{unresolvedCount}项待核对</span>}</div>{daily&&saveBatch&&<button type="button" className={styles.addExercise} onClick={addItem}>＋ 添加运动</button>}</div>
    {daily&&modes.activityMode==="activities"&&<p className={styles.hint}>只合计已记录的消耗；日常走动等也可添加为明细。</p>}
    {daily?saveBatch?<>{unresolved.length>1&&<div className={styles.bulkChoices}><button type="button" onClick={()=>setItems(rows=>rows.map(item=>item.completed===false?item:{...item,inclusion:"included",choiceSignature:relationKey(item)}))}>全部已包含</button><button type="button" onClick={()=>setItems(rows=>rows.map(item=>item.completed===false?item:{...item,inclusion:"additional",choiceSignature:relationKey(item)}))}>全部额外增加</button></div>}
    {items.map((item,index)=><details data-new-activity={item.key==="new-activity"||undefined} className={styles.activityDraft} key={item.key} open={expanded.has(item.key)||!aggregateEditing&&unresolved[0]?.key===item.key} onToggle={event=>{if(event.target!==event.currentTarget)return;const open=event.currentTarget.open;setExpanded(previous=>{if(previous.has(item.key)===open)return previous;const next=new Set(previous);if(open)next.add(item.key);else next.delete(item.key);return next;});}}>
     <summary><span>{item.name||"运动 "+(index+1)}</span><span>{energyValue(activityReadings({...item,caloriesKcal:item.caloriesKcal??null}).totalKcal)} 千卡{needsReview(item)&&!relation(item)&&item.completed!==false?" · 待核对":""}</span></summary>
     <label>运动名称<input aria-label={"运动名称 "+(index+1)} maxLength={200} required={exerciseHasInput(item)} value={item.name} onChange={event=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,name:event.target.value}:row))}/></label>
     <ExerciseFields value={item} change={next=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,...next}:row))} day={projected} relation={relation(item)} pending={needsReview(item)&&!relation(item)} suffix={" "+(index+1)}/>
     <div className={styles.fields}><SourceInput label={"运动来源 "+(index+1)} sources={sources} removeSource={removeSource} disabled={busy} maxLength={200} value={item.sourceSystem??""} onChange={value=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,sourceSystem:value||null,sourceRecordId:null}:row))}/><label>时长 · 分钟（选填）<DecimalInput precision={0} aria-label={"运动时长 · 分钟 "+(index+1)} min={0} max={1000000} value={item.durationMinutes} onValue={value=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,durationMinutes:value||null}:row))}/></label></div>
     {item.completed===false&&<p className={styles.hint}>历史未计入，原记录保持。</p>}
     {baseline&&item.completed!==false&&!aggregateEditing&&(needsReview(item)&&!relation(item)||adjusting.has(item.key))&&relationButtons(relation(item),value=>choose(item,value),"运动 "+(index+1)+" 包含关系")}
     <div className={styles.exerciseActions}>{baseline&&item.completed!==false&&relation(item)&&<button type="button" onClick={()=>setAdjusting(keys=>new Set([...keys,item.key]))}>修改包含关系</button>}<button type="button" className={styles.removeExercise} onClick={()=>setItems(rows=>rows.filter(row=>row.key!==item.key))}>移除运动 {index+1}</button></div>
    </details>)}</>:<>{items.map(item=><p key={item.key}>{item.name} · 本次共 {energyValue(activitySummary(item,projected,{relation:relation(item)}).totalKcal)} 千卡 · {activitySummary(item,projected,{relation:relation(item)}).effect}</p>)}<p className={styles.hint}>运动在AI确认页面中分别修改和核对。</p></>:<>
     <label>活动名称<input aria-label="活动名称" maxLength={200} required value={draft.name} onChange={event=>set("name",event.target.value)}/></label>
     <ExerciseFields value={draft} day={projected} relation={selectedRelation} pending={singleRequires&&!selectedRelation} change={next=>setDraft(current=>({...current,...next}))}/>
     <div className={styles.fields}>{source("sourceSystem","活动来源")}<label>时长 · 分钟（选填）<DecimalInput precision={0} aria-label="时长 · 分钟" min={0} max={1000000} value={draft.durationMinutes} onValue={value=>set("durationMinutes",value||null)}/></label></div>
     {draft.completed===false&&<p className={styles.hint}>历史未计入，原记录保持。</p>}
     {singleRequires&&relationButtons(selectedRelation,value=>setSingleChoice({signature:relationKey(draft),value}),"活动包含关系")}
    </>}
   </section>}
   {!daily&&<details className={styles.entrySection}><summary>时区</summary><div className={styles.timeFields}><label>时区<input aria-label="时区" maxLength={100} value={draft.timezone??""} onChange={event=>set("timezone",event.target.value)}/></label></div></details>}
   </>:draft.kind==="restore_activity"?<><h3>恢复 {originalActivity?.name??"运动"}</h3><p>请返回对应日期核对当前记录。</p></>:null}

   {submitLabel!=="保存"&&<p className={styles.hint}>应用修改后返回确认页面，确认保存后才正式记录。</p>}
  </fieldset>
  {management}
  <div className={styles.stickyTotal} data-entry-footer>
   <div role="group" aria-label="当天总消耗">
    <span>{daily?quick?"预计全天消耗":"合计":"当天总消耗"}</span>
    {pending?(!error&&<LocalLoading/>):(!fast||total!=null)&&<strong>{energyValue(total)} <small>千卡</small></strong>}
    {!pending&&entryIssue&&<small role="status">{entryIssue}</small>}
    {!pending&&fast&&supplementKind&&<div className={styles.footerRecovery}>
      <button type="button" data-guide-target="energy-supplement" disabled={busy} onClick={()=>setSupplement(supplementKind)}>{supplementLabel}</button>
    </div>}
    {!pending&&fast&&contextError&&<div className={styles.footerRecovery}><button type="button" onClick={()=>void recalculate()}>重试读取</button></div>}
    {!pending&&!entryIssue&&(unresolvedCount>0||total==null)&&<small>{unresolvedCount?unresolvedCount+"项运动待核对":missing+"，可保存已有部分"}</small>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
   </div>
   <button data-entry-primary-action data-guide-target={onRetry?undefined:"energy-save"} className={styles.headerSave} type={onRetry?"button":"submit"} onClick={onRetry} aria-label={targetDate?`${onRetry?"重新读取":submitLabel} ${targetDate} 消耗记录`:onRetry?"重新读取":submitLabel} disabled={onRetry?false:blocked}>{onRetry?"重新读取":saveLabel}</button>
  </div>
 </form>{supplement&&targetDate&&<EnergySupplement kind={supplement} date={targetDate} today={today} close={()=>{setSupplement(null);setContextEpoch(epoch=>epoch+1);if(resumeEstimator){setResumeEstimator(false);setContextLoading(true);setEstimatorOpen(true);}}}/>}</>;
}
type ExerciseInput={calorieMode?:"total"|"components";completed?:boolean;caloriesKcal?:string|null;exerciseRestingKcal?:string|null;exerciseActiveKcal?:string|null};
const exerciseCalorieModes = [["total", "只记总数"], ["components", "分开填写"]] as const;

function ExerciseFields({value,change,suffix="",day,relation,pending}:{value:ExerciseInput;change:(next:ExerciseInput)=>void;suffix?:string;day?:EnergyDayRecord|null;relation?:Choice|null;pending?:boolean}){
 const mode=value.calorieMode??"total",readings=activitySummary(value,day,{relation,pending});
 const slide = useSlidingSelection(mode === "total" ? 0 : 1, index => change({ calorieMode: exerciseCalorieModes[index][0] }));
 const input=(key:"caloriesKcal"|"exerciseActiveKcal"|"exerciseRestingKcal",label:string)=><label>{label}<DecimalInput precision={0} aria-label={label+suffix} min={0} max={1000000} placeholder="未知" value={value[key]} onValue={next=>change({[key]:next||null})}/></label>;
 return <section className={styles.exerciseFields} data-mode={mode}><div {...slide} className={styles.modeSwitch + " " + glass.track} role="group" aria-label={"运动热量填写方式"+suffix}>
   <span className={glass.selection} data-capsule-indicator aria-hidden="true"/>
   {exerciseCalorieModes.map(([key, label], index) =>
     <button type="button" key={key} data-capsule-choice={index} aria-pressed={mode === key} onClick={() => change({calorieMode:key})}>{label}</button>
   )}
 </div><div className={styles.fields}>{mode==="total"?input("caloriesKcal","本次运动总消耗 · 千卡"):<>{input("exerciseActiveKcal","纯运动消耗 · 千卡")}{input("exerciseRestingKcal","运动期间静息 千卡")}</>}</div><p className={styles.exerciseReading}>本次共 {energyValue(readings.totalKcal)} 千卡{readings.breakdown&&<span>{readings.breakdown}</span>}</p>{!pending&&<p className={styles.inclusionStatus} data-exercise-effect>{readings.effect}</p>}</section>;
}
