"use client";
import {useRef,useState} from "react";
import {confirmAction} from "@/components/confirmation-state";
import {confirmNumbers} from "@/components/number-change";
import {DecimalInput} from "@/components/decimal-input";
import {useDraftGuard} from "@/components/draft-guard";
import {RecordDateContext} from "@/components/record-date-context";
import {SourceInput,type SourceRemovalResult} from "@/components/source-input";
import {activityCalories,activityCalorieFields,activityReadings,activityEnergyChanged,energyBaseline,energyDays,energyModes,energyValue,type ActivityRecord,type EnergyDayRecord,type EnergyAction} from "./model";
import {activitySummary} from "./activity-summary";
import styles from "./energy.module.css";
type Choice="included"|"additional";
type ActivityAction=Extract<EnergyAction,{kind:"save_activity"}>;
type ActivityDraft=ActivityAction&{key:string;initialBasis?:string|null;choiceSignature?:string};
const blankProvenance={timezone:"Asia/Shanghai",sourceSystem:null,sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal" as const,syncStatus:"confirmed" as const};
function activityRecord(action:ActivityAction,key:string,prior?:ActivityRecord):ActivityRecord{
 return {...blankProvenance,...prior,...action,...activityCalorieFields(action,prior),id:action.id??key,version:action.version??1,deletedAt:null,durationMinutes:action.durationMinutes===undefined?prior?.durationMinutes??null:action.durationMinutes,completed:action.completed??prior?.completed??true,timezone:action.timezone??prior?.timezone??"Asia/Shanghai"};
}
function itemDraft(row:ActivityRecord):ActivityDraft{
 return {kind:"save_activity",key:row.id,id:row.id,version:row.version,date:row.date,name:row.name,calorieMode:row.calorieMode??undefined,caloriesKcal:row.caloriesKcal,exerciseActiveKcal:row.exerciseActiveKcal,exerciseRestingKcal:row.exerciseRestingKcal,durationMinutes:row.durationMinutes,completed:row.completed,sourceSystem:row.sourceSystem,sourceRecordId:row.sourceRecordId,sourceOccurredAt:row.sourceOccurredAt,timezone:row.timezone,inclusion:row.inclusion,initialBasis:row.inclusionBasis};
}
export function EnergyEditor({initial,activities=[],dayRecords=[],activityPreview,sources,removeSource,busy,error,save,saveBatch,submitLabel="保存"}:{
 initial:EnergyAction;activities?:ActivityRecord[];dayRecords?:EnergyDayRecord[];activityPreview?:ActivityRecord;sources:string[];removeSource:(label:string)=>Promise<SourceRemovalResult>;busy:boolean;error:string;save:(action:EnergyAction)=>void;saveBatch?:(actions:EnergyAction[])=>void;submitLabel?:string;
}){
 const numberAcknowledgements=useRef(new Set<string>()),submitting=useRef(false);
 const [openedOn]=useState(()=>new Date().toLocaleDateString("en-CA"));
 const [draft,setDraft]=useState<EnergyAction>(()=>{
  if(initial.kind!=="save_activity")return structuredClone(initial);
  const row=activityPreview??activities.find(row=>row.id===initial.id);
  return structuredClone(row?{...initial,calorieMode:initial.calorieMode??row.calorieMode??undefined,caloriesKcal:initial.caloriesKcal===undefined?row.caloriesKcal:initial.caloriesKcal,exerciseActiveKcal:initial.exerciseActiveKcal===undefined?row.exerciseActiveKcal:initial.exerciseActiveKcal,exerciseRestingKcal:initial.exerciseRestingKcal===undefined?row.exerciseRestingKcal:initial.exerciseRestingKcal,durationMinutes:initial.durationMinutes===undefined?row.durationMinutes:initial.durationMinutes,sourceSystem:initial.sourceSystem===undefined?row.sourceSystem:initial.sourceSystem,timezone:initial.timezone??row.timezone,completed:initial.completed??row.completed}:initial);
 });
 const daily=draft.kind==="save_energy_day",single=draft.kind==="save_activity";
 const originalActivity=activityPreview??activities.find(row=>"id" in initial&&row.id===initial.id);
 const targetDate="date" in draft?draft.date:originalActivity?.date;
 const day=dayRecords.find(row=>!row.deletedAt&&row.date===targetDate);
 const [items,setItems]=useState<ActivityDraft[]>(()=>activities.filter(row=>!row.deletedAt&&initial.kind==="save_energy_day"&&row.date===initial.date).map(itemDraft));
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set(items.length?[items[0].key]:[]));
 const [adjusting,setAdjusting]=useState<Set<string>>(new Set());
 const [aggregateEditing,setAggregateEditing]=useState(false),[aggregateEpoch,setAggregateEpoch]=useState(0);
 const originalBaseline=energyBaseline(day);
 const modes=daily?energyModes({...draft,totalKcal:draft.totalKcal??null,activeKcal:draft.activeKcal??null,activityMode:draft.activityMode??(draft.activeKcal!=null?"total":"activities")}):energyModes(day);
 const projected:EnergyDayRecord|null=targetDate?daily?{
  ...blankProvenance,...day,id:draft.id??day?.id??"draft:"+targetDate,version:draft.version??day?.version??1,deletedAt:null,date:targetDate,
  entryMode:modes.entryMode,activityMode:modes.activityMode,restingKcal:draft.restingKcal??null,activeKcal:draft.activeKcal??null,totalKcal:draft.totalKcal??null,
  timezone:draft.timezone??day?.timezone??"Asia/Shanghai"
 }:day??{...blankProvenance,id:"draft:"+targetDate,version:1,deletedAt:null,date:targetDate,entryMode:"components",activityMode:"activities",restingKcal:null,activeKcal:null,totalKcal:null}:null;
 const baseline=energyBaseline(projected);
 const relationKey=(action:ActivityAction)=>JSON.stringify([baseline,aggregateEpoch,action.date,activityCalories(activityCalorieFields(action)),action.completed??true]);
 const initialSingleChoice=single&&draft.inclusion&&originalActivity?.inclusionBasis===baseline?draft.inclusion:originalActivity?.inclusionBasis===baseline?originalActivity?.inclusion??null:null;
 const [singleChoice,setSingleChoice]=useState<{signature:string;value:Choice|null}>(()=>({signature:single?relationKey(draft):"",value:initialSingleChoice}));
 function changed(item:ActivityDraft){const before=activities.find(row=>row.id===item.id);return !before||activityEnergyChanged(before,activityRecord(item,item.key,before));}
 function relation(item:ActivityDraft):Choice|null{
  if(!baseline)return null;
  if(item.choiceSignature===relationKey(item))return item.inclusion??null;
  return aggregateEpoch===0&&baseline===originalBaseline&&!changed(item)&&item.initialBasis===baseline?item.inclusion??null:null;
 }
 const relevant=items.filter(item=>item.name.trim()&&item.completed!==false);
 const needsReview=(item:ActivityDraft)=>!!baseline&&(aggregateEpoch>0||baseline!==originalBaseline||changed(item)||!!item.inclusion&&item.initialBasis!==baseline);
 const unresolved=baseline?relevant.filter(item=>needsReview(item)&&!relation(item)):[];
 const singleChanged=single&&(!originalActivity||activityEnergyChanged(originalActivity,activityRecord(draft,"single",originalActivity)));
 const selectedRelation=single&&singleChoice.signature===relationKey(draft)?singleChoice.value:null;
 const singleRequires=!!baseline&&single&&draft.completed!==false&&(singleChanged||!selectedRelation);
 const projectedItems:ActivityRecord[]=daily?items.filter(item=>item.name.trim()).map(item=>({...activityRecord({...item,date:targetDate!},item.key,activities.find(row=>row.id===item.id)),inclusion:relation(item),inclusionBasis:relation(item)?baseline:null})):activities.filter(row=>!row.deletedAt&&row.date===targetDate&&(!single||row.id!==(draft.id??originalActivity?.id)));
 if(single)projectedItems.push({...activityRecord(draft,"single",originalActivity),inclusion:selectedRelation,inclusionBasis:selectedRelation?baseline:null});
 const autoActive=energyDays({days:projected?[{...projected,entryMode:"components",activityMode:"activities",activeKcal:null,totalKcal:null}]:[],activities:projectedItems,profiles:[]},[],targetDate?[targetDate]:[])[0]?.activeKcal??null;
 const unresolvedCount=daily?unresolved.length:singleRequires&&!selectedRelation?1:0;
 const total=unresolvedCount?null:projected?energyDays({days:[projected],activities:projectedItems,profiles:[]},[],[projected.date])[0].totalKcal:null;
 const signature=JSON.stringify([draft,items,singleChoice]),[firstSignature]=useState(signature);useDraftGuard(signature!==firstSignature,busy);
 const set=(key:string,value:unknown)=>setDraft(current=>({...current,[key]:value,...(key==="restingKcal"?{restingEstimated:false}:key==="activeKcal"?{activeEstimated:false}:{}),...(key.endsWith("SourceSystem")||key==="sourceSystem"?{sourceRecordId:null}:{})}));
 function aggregate(value:string){if(!daily)return;setAggregateEpoch(epoch=>epoch+1);setDraft(current=>({...current,activeKcal:value||null,activityMode:value?"total":"activities",activeEstimated:false}));}
 function aggregateFinished(){setAggregateEditing(false);if(unresolved[0])setExpanded(values=>new Set([...values,unresolved[0].key]));}
 function choose(item:ActivityDraft,value:Choice){setItems(rows=>rows.map(row=>row.key===item.key?{...row,inclusion:value,choiceSignature:relationKey(row)}:row));setAdjusting(keys=>new Set([...keys].filter(key=>key!==item.key)));}
 function relationButtons(value:Choice|null,onChoose:(choice:Choice)=>void,label:string){return <div className={styles.inclusion} role="group" aria-label={label}><span>这项运动是否已包含在当天{modes.entryMode==="total"?"总消耗":"活动合计"} {energyValue(modes.entryMode==="total"?projected?.totalKcal:projected?.activeKcal)} 千卡中？</span><div>{([["included","已包含"],["additional","额外增加"]] as const).map(([choice,text])=><button key={choice} type="button" aria-pressed={value===choice} onClick={()=>onChoose(choice)}>{text}</button>)}</div></div>;}
 const source=(key:"sourceSystem"|"restingSourceSystem"|"activeSourceSystem",label:string)=><SourceInput label={label} value={key in draft?(draft as Record<string,unknown>)[key] as string??"":key!=="sourceSystem"&&"sourceSystem" in draft?draft.sourceSystem??"":""} sources={sources} removeSource={removeSource} disabled={busy} maxLength={200} onChange={value=>set(key,value||null)}/>;
 const field=(key:"restingKcal"|"totalKcal",label:string)=><label>{label}<DecimalInput precision={0} min={0} max={1000000} aria-label={label} placeholder="未知可留空" value={key in draft?(draft as Record<string,unknown>)[key] as string:null} onFocus={()=>key==="totalKcal"&&setAggregateEditing(true)} onBlur={aggregateFinished} onValue={value=>{if(key==="totalKcal")setAggregateEpoch(epoch=>epoch+1);set(key,value||null);}}/></label>;
 async function submit(){
  if(submitting.current||busy)return;submitting.current=true;
  try{
   if(single){
    if(singleRequires&&!selectedRelation)return;
    if(!await confirmNumbers([{label:"本次运动",unit:"kcal",value:activityCalories(activityCalorieFields(draft)),previous:originalActivity?activityCalories(originalActivity):undefined}],numberAcknowledgements.current))return;
    save({...draft,...(baseline&&selectedRelation?{inclusion:selectedRelation}:{})});return;
   }
   if(!daily){save(draft);return;}
   if(saveBatch&&unresolved.length)return;
   if(!await confirmNumbers((["restingKcal","activeKcal","totalKcal"] as const).map(key=>({label:key==="restingKcal"?"静息":key==="activeKcal"?"活动合计":"总消耗",unit:"kcal",value:key==="activeKcal"&&modes.activityMode==="activities"?autoActive:draft[key],previous:day?.[key]})),numberAcknowledgements.current))return;
   const {restingKcal,activeKcal,totalKcal,...base}=draft;
   const dayAction:EnergyAction=modes.entryMode==="total"?{...base,entryMode:"total",activityMode:modes.activityMode,totalKcal:totalKcal??null}:{...base,entryMode:"components",activityMode:modes.activityMode,restingKcal:restingKcal??null,...(modes.activityMode==="total"?{activeKcal:activeKcal??null}:{})};
   if(!saveBatch){save(dayAction);return;}
   const changes:EnergyAction[]=[dayAction];
   for(const item of items){const {key,initialBasis,choiceSignature,inclusion,...action}=item;void key;void initialBasis;void choiceSignature;void inclusion;const choice=relation(item);changes.push({...action,date:draft.date,...(baseline&&choice?{inclusion:choice}:{})});}
   for(const row of activities.filter(row=>!row.deletedAt&&row.date===(initial.kind==="save_energy_day"?initial.date:draft.date)&&!items.some(item=>item.id===row.id)))changes.push({kind:"delete_activity",id:row.id,version:row.version});
   const removed=changes.filter(action=>action.kind==="delete_activity");
   if(removed.length&&!await confirmAction({title:"删除已移除的运动？",message:"保存后将永久删除 "+removed.length+" 条已记录运动，其他记录保留。",confirmLabel:"确认删除并保存",danger:true}))return;
   saveBatch(changes);
  }finally{submitting.current=false;}
 }
 const retired=draft.kind.includes("energy_defaults")||draft.kind.includes("energy_profile"),blocked=busy||retired||!!(saveBatch&&daily&&unresolvedCount)||!!(singleRequires&&!selectedRelation);
 const missing= modes.entryMode==="total"&&projected?.totalKcal==null?"还没填当天总数":modes.entryMode==="components"&&projected?.restingKcal==null?"还没填当天静息":modes.activityMode==="total"&&projected?.activeKcal==null?"还没填活动合计":"有运动热量未知";
 const saveLabel=busy?submitLabel==="应用修改"?"正在应用…":"正在保存…":submitLabel==="保存"&&targetDate?"保存 · "+targetDate:submitLabel;
 function addItem(){if(!daily)return;const key=crypto.randomUUID();setItems(rows=>[...rows,{key,kind:"save_activity",date:draft.date,name:"",calorieMode:"total",completed:true,timezone:draft.timezone}]);setExpanded(values=>new Set([...values,key]));}
 return <form className={styles.form+" "+styles.energyEntry} aria-busy={busy} onSubmit={event=>{event.preventDefault();void submit();}}>
  <div className={styles.stickyTotal}><div>{targetDate&&<RecordDateContext date={targetDate} openedOn={openedOn}/>}<span>当天总消耗 <small>kcal</small></span><strong>{energyValue(total)}</strong>{(unresolvedCount>0||total==null)&&<small>{unresolvedCount?unresolvedCount+"项运动待核对":missing+"，可保存已有部分"}</small>}</div><button className={styles.headerSave} type="submit" disabled={blocked}>{saveLabel}</button></div>
  <fieldset disabled={busy||retired}>
   {retired?<p role="alert">日常默认值和静息公式资料已停用，请取消这一项。</p>:daily||single?<>
   <section className={styles.entrySection}><h3>{modes.entryMode==="total"?"总消耗":"静息与活动"}</h3>
    {daily?<><div className={styles.modeSwitch} role="group" aria-label="消耗录入方式">{([["components","分开记录"],["total","只记总数"]] as const).map(([mode,text])=><button type="button" key={mode} aria-pressed={modes.entryMode===mode} onClick={()=>{set("entryMode",mode);setAggregateEpoch(epoch=>epoch+1);}}>{text}</button>)}</div>
     {modes.entryMode==="components"?<><div className={styles.fields}>{field("restingKcal","静息 · kcal")}{source("restingSourceSystem","静息来源")}</div><div className={styles.fields}><label>活动合计 · kcal<DecimalInput precision={0} aria-label="活动合计 · kcal" min={0} max={1000000} data-calorie-origin={modes.activityMode==="activities"?"automatic":"manual"} value={modes.activityMode==="activities"?autoActive:draft.activeKcal} placeholder="由运动累计，也可直接填写" onFocus={()=>setAggregateEditing(true)} onBlur={aggregateFinished} onValue={aggregate}/></label>{modes.activityMode==="activities"?<div className={styles.derivedSource}><span>来源（随运动）</span><p>{[...new Set(projectedItems.map(row=>row.sourceSystem).filter(Boolean))].join("、")||"运动明细"}</p></div>:source("activeSourceSystem","活动来源")}</div><p className={styles.hint}>{modes.activityMode==="activities"?"由"+projectedItems.filter(row=>row.completed).length+"项运动自动累计；可以改填全天合计":"手填活动合计"}{modes.activityMode==="total"&&<button type="button" onClick={()=>{aggregate("");setAggregateEditing(false);}}>恢复运动累计</button>}</p></>:<div className={styles.fields}>{field("totalKcal","全天总消耗 · kcal")}{source("sourceSystem","总消耗来源")}</div>}
    </>:<div className={styles.contextReadings}><div><span>静息 · kcal</span><strong>{energyValue(day?.restingKcal)}</strong></div><div><span>{modes.entryMode==="total"?"录入总数":"活动合计"} · kcal</span><strong>{energyValue(modes.entryMode==="total"?day?.totalKcal:modes.activityMode==="total"?day?.activeKcal:autoActive)}</strong></div></div>}
   </section>
   <section className={styles.entrySection}><div className={styles.title}><h3>运动明细 <small>{daily?items.length:"1"}项</small></h3>{unresolvedCount>0&&<span className={styles.pendingBadge}>{unresolvedCount}项待核对</span>}</div>
    {daily?saveBatch?<>{unresolved.length>1&&<div className={styles.bulkChoices}><button type="button" onClick={()=>setItems(rows=>rows.map(item=>item.completed===false?item:{...item,inclusion:"included",choiceSignature:relationKey(item)}))}>全部已包含</button><button type="button" onClick={()=>setItems(rows=>rows.map(item=>item.completed===false?item:{...item,inclusion:"additional",choiceSignature:relationKey(item)}))}>全部额外增加</button></div>}
    {items.map((item,index)=><details className={styles.activityDraft} key={item.key} open={expanded.has(item.key)||!aggregateEditing&&unresolved[0]?.key===item.key} onToggle={event=>{if(event.target!==event.currentTarget)return;const open=event.currentTarget.open;setExpanded(previous=>{if(previous.has(item.key)===open)return previous;const next=new Set(previous);if(open)next.add(item.key);else next.delete(item.key);return next;});}}>
     <summary><span>{item.name||"运动 "+(index+1)}</span><span>{energyValue(activityReadings({...item,caloriesKcal:item.caloriesKcal??null}).totalKcal)} kcal{needsReview(item)&&!relation(item)&&item.completed!==false?" · 待核对":""}</span></summary>
     <label>运动名称<input aria-label={"运动名称 "+(index+1)} maxLength={200} required value={item.name} onChange={event=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,name:event.target.value}:row))}/></label>
     <ExerciseFields value={item} change={next=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,...next}:row))} day={projected} relation={relation(item)} pending={needsReview(item)&&!relation(item)} suffix={" "+(index+1)}/>
     <div className={styles.fields}><SourceInput label={"运动来源 "+(index+1)} sources={sources} removeSource={removeSource} disabled={busy} maxLength={200} value={item.sourceSystem??""} onChange={value=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,sourceSystem:value||null,sourceRecordId:null}:row))}/><label>时长 · 分钟（选填）<DecimalInput precision={0} aria-label={"运动时长 · 分钟 "+(index+1)} min={0} max={1000000} value={item.durationMinutes} onValue={value=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,durationMinutes:value||null}:row))}/></label></div>
     {item.completed===false&&<p className={styles.hint}>历史未计入，原记录保持。</p>}
     {baseline&&item.completed!==false&&!aggregateEditing&&(needsReview(item)&&!relation(item)||adjusting.has(item.key))&&relationButtons(relation(item),value=>choose(item,value),"运动 "+(index+1)+" 包含关系")}
     <div className={styles.exerciseActions}>{baseline&&item.completed!==false&&relation(item)&&<button type="button" onClick={()=>setAdjusting(keys=>new Set([...keys,item.key]))}>修改包含关系</button>}<button type="button" className={styles.removeExercise} onClick={()=>setItems(rows=>rows.filter(row=>row.key!==item.key))}>移除运动 {index+1}</button></div>
    </details>)}<button type="button" onClick={addItem}>＋ 添加运动</button></>:<>{items.map(item=><p key={item.key}>{item.name} · 本次共 {energyValue(activitySummary(item,projected,{relation:relation(item)}).totalKcal)} kcal · {activitySummary(item,projected,{relation:relation(item)}).effect}</p>)}<p className={styles.hint}>运动在AI确认页面中分别修改和核对。</p></>:<>
     <label>活动名称<input aria-label="活动名称" maxLength={200} required value={draft.name} onChange={event=>set("name",event.target.value)}/></label>
     <ExerciseFields value={draft} day={projected} relation={selectedRelation} pending={singleRequires&&!selectedRelation} change={next=>setDraft(current=>({...current,...next}))}/>
     <div className={styles.fields}>{source("sourceSystem","活动来源")}<label>时长 · 分钟（选填）<DecimalInput precision={0} aria-label="时长 · 分钟" min={0} max={1000000} value={draft.durationMinutes} onValue={value=>set("durationMinutes",value||null)}/></label></div>
     {draft.completed===false&&<p className={styles.hint}>历史未计入，原记录保持。</p>}
     {singleRequires&&relationButtons(selectedRelation,value=>setSingleChoice({signature:relationKey(draft),value}),"活动包含关系")}
    </>}
   </section>
   <details className={styles.entrySection}><summary>时间与备注</summary><div className={styles.fields}><label>日期<input aria-label="日期" type="date" required value={draft.date} onChange={event=>set("date",event.target.value)}/></label><label>时区<input aria-label="时区" maxLength={100} value={draft.timezone??""} onChange={event=>set("timezone",event.target.value)}/></label>{daily&&<label>备注<input aria-label="备注" maxLength={2000} value={draft.notes??""} onChange={event=>set("notes",event.target.value||null)}/></label>}</div></details>
   </>:draft.kind==="restore_activity"?<><h3>恢复 {originalActivity?.name??"运动"}</h3><p>请返回对应日期核对当前记录。</p></>:null}
   {error&&<p className={styles.error} role="alert">{error}</p>}
   {submitLabel!=="保存"&&<p className={styles.hint}>应用修改后返回确认页面，确认保存后才正式记录。</p>}
  </fieldset>
 </form>;
}
type ExerciseInput={calorieMode?:"total"|"components";completed?:boolean;caloriesKcal?:string|null;exerciseRestingKcal?:string|null;exerciseActiveKcal?:string|null};
function ExerciseFields({value,change,suffix="",day,relation,pending}:{value:ExerciseInput;change:(next:ExerciseInput)=>void;suffix?:string;day?:EnergyDayRecord|null;relation?:Choice|null;pending?:boolean}){
 const mode=value.calorieMode??"total",readings=activitySummary(value,day,{relation,pending});
 const input=(key:"caloriesKcal"|"exerciseActiveKcal"|"exerciseRestingKcal",label:string)=><label>{label}<DecimalInput precision={0} aria-label={label+suffix} min={0} max={1000000} placeholder="未知可留空" value={value[key]} onValue={next=>change({[key]:next||null})}/></label>;
 return <section className={styles.exerciseFields} data-mode={mode}><div className={styles.modeSwitch} role="group" aria-label={"运动热量填写方式"+suffix}>{([["total","只记总数"],["components","分开填写"]] as const).map(([key,label])=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>change({calorieMode:key})}>{label}</button>)}</div><div className={styles.fields}>{mode==="total"?input("caloriesKcal","本次运动总消耗 · kcal"):<>{input("exerciseActiveKcal","纯运动消耗 · kcal")}{input("exerciseRestingKcal","运动期间静息 · kcal")}</>}</div><p className={styles.exerciseReading}>本次共 {energyValue(readings.totalKcal)} 千卡{readings.breakdown&&<span>{readings.breakdown}</span>}</p>{!pending&&<p className={styles.inclusionStatus} data-exercise-effect>{readings.effect}</p>}</section>;
}
