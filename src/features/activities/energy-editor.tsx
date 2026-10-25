"use client";
import {useState} from "react";
import {useDraftGuard} from "@/components/draft-guard";
import {RecordDateContext} from "@/components/record-date-context";
import {SourceInput,type SourceRemovalResult} from "@/components/source-input";
import {energyBaseline,energyDays,energyModes,energyValue,type ActivityRecord,type EnergyDayRecord,type EnergyAction} from "./model";
import styles from "./energy.module.css";
type Choice="included"|"additional";
type ActivityDraft=Extract<EnergyAction,{kind:"save_activity"}>&{key:string;initialBasis?:string|null;choiceBasis?:string|null};
export function EnergyEditor({initial,activities=[],dayRecords=[],activityPreview,sources,removeSource,busy,error,save,saveBatch,submitLabel="保存"}:{
 initial:EnergyAction;activities?:ActivityRecord[];dayRecords?:EnergyDayRecord[];activityPreview?:ActivityRecord;
 sources:string[];removeSource:(label:string)=>Promise<SourceRemovalResult>;busy:boolean;error:string;
 save:(action:EnergyAction)=>void;saveBatch?:(actions:EnergyAction[])=>void;submitLabel?:string;
}){
 const [openedOn]=useState(()=>new Date().toLocaleDateString("en-CA"));
 const [draft,setDraft]=useState(()=>Object.fromEntries(Object.entries(initial).map(([key,value])=>[key,["restingKcal","activeKcal","totalKcal","caloriesKcal","durationMinutes"].includes(key)&&typeof value==="string"?String(Number(value)):value])) as EnergyAction);
 const [items,setItems]=useState<ActivityDraft[]>(()=>activities.filter(row=>!row.deletedAt&&initial.kind==="save_energy_day"&&row.date===initial.date).map(row=>({
  key:row.id,kind:"save_activity",id:row.id,version:row.version,date:row.date,name:row.name,durationMinutes:row.durationMinutes===null?null:String(Number(row.durationMinutes)),caloriesKcal:row.caloriesKcal===null?null:String(Number(row.caloriesKcal)),completed:row.completed,sourceSystem:row.sourceSystem,timezone:row.timezone,inclusion:row.inclusion,initialBasis:row.inclusionBasis
 })));
 const originalActivity=activityPreview??activities.find(row=>"id" in initial&&row.id===initial.id);
 const day= "date" in draft?dayRecords.find(row=>!row.deletedAt&&row.date===draft.date):originalActivity?dayRecords.find(row=>!row.deletedAt&&row.date===originalActivity.date):undefined;
 const modes=draft.kind==="save_energy_day"?energyModes({...draft,totalKcal:draft.totalKcal??null,activeKcal:draft.activeKcal??null,activityMode:draft.activityMode??(draft.activeKcal!=null||!draft.id?"total":"activities")}):energyModes(day);
 const projected:EnergyDayRecord|null=draft.kind==="save_energy_day"?{
  id:draft.id??day?.id??"draft:"+draft.date,version:draft.version??day?.version??1,deletedAt:null,date:draft.date,
  entryMode:modes.entryMode,activityMode:modes.activityMode,restingKcal:draft.restingKcal??null,
  activeKcal:modes.activityMode==="total"?draft.activeKcal??"0":null,totalKcal:draft.totalKcal??null,
  timezone:draft.timezone??day?.timezone??"Asia/Shanghai",sourceSystem:draft.sourceSystem??null,sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal",syncStatus:"confirmed",
 }:day??null;
 const baseline=energyBaseline(projected),originalBaseline=energyBaseline(day),aggregateChanged=baseline!==originalBaseline;
 const [singleChoice,setSingleChoice]=useState<{basis:string|null;value:Choice|null}>(()=>({
  basis:energyBaseline(day),value:"inclusion" in initial&&initial.inclusion?initial.inclusion:originalActivity?.inclusionBasis===energyBaseline(day)?originalActivity?.inclusion??null:null
 }));
 const relation=(item:ActivityDraft)=>item.choiceBasis===baseline||!aggregateChanged&&item.initialBasis===baseline?item.inclusion??null:null;
 const changedEnergy=(item:ActivityDraft)=>{const prior=activities.find(row=>row.id===item.id);return !prior||prior.date!==item.date||prior.completed!==(item.completed??true)||Number(prior.caloriesKcal)!==Number(item.caloriesKcal)||(prior.caloriesKcal===null)!==(item.caloriesKcal==null);};
 const needsRelation=(item:ActivityDraft)=>!!baseline&&item.completed!==false&&(aggregateChanged||changedEnergy(item));
 const unresolved=items.filter(item=>needsRelation(item)&&!relation(item));
 const selectedRelation=singleChoice.basis===baseline?singleChoice.value:null;
 const singleChanged=draft.kind==="save_activity"&&(!draft.id||!originalActivity||draft.date!==originalActivity.date||(draft.completed??true)!==originalActivity.completed||Number(draft.caloriesKcal)!==Number(originalActivity.caloriesKcal)||(draft.caloriesKcal==null)!==(originalActivity.caloriesKcal===null));
 const singleRequires=!!baseline&&(draft.kind==="restore_activity"||singleChanged);
 const projectedActivities:ActivityRecord[]=items.map(item=>({
  id:item.id??item.key,version:item.version??1,deletedAt:null,date:draft.kind==="save_energy_day"?draft.date:item.date,name:item.name,caloriesKcal:item.caloriesKcal??null,durationMinutes:item.durationMinutes??null,completed:item.completed??true,
  inclusion:relation(item),inclusionBasis:relation(item)?baseline:null,timezone:item.timezone??"Asia/Shanghai",sourceSystem:item.sourceSystem??null,sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal",syncStatus:"confirmed",
 }));
 const total=projected?energyDays({days:[projected],activities:projectedActivities,profiles:[]},[],[projected.date])[0].totalKcal:null;
 const signature=JSON.stringify([draft,items,singleChoice]);const [firstSignature]=useState(signature);useDraftGuard(signature!==firstSignature,busy);
 const set=(key:string,value:unknown)=>setDraft(current=>({...current,[key]:value,...(key==="restingKcal"?{restingEstimated:false}:key==="activeKcal"?{activeEstimated:false}:key==="sourceSystem"?{sourceRecordId:null}:{})}));
 const field=(key:"restingKcal"|"activeKcal"|"totalKcal"|"caloriesKcal"|"durationMinutes",label:string,placeholder="未填写")=><label>{label}<input aria-label={label} type="number" min="0" max="1000000" step="0.0001" inputMode="decimal" placeholder={placeholder} value={key in draft?(draft as Record<string,unknown>)[key] as string??"":""} onChange={event=>set(key,event.target.value||null)}/></label>;
 const source=(key:"sourceSystem"|"restingSourceSystem"|"activeSourceSystem",label:string)=><SourceInput label={label} value={key in draft?(draft as Record<string,unknown>)[key] as string??"":key!=="sourceSystem"&&"sourceSystem" in draft?draft.sourceSystem??"":""} sources={sources} removeSource={removeSource} disabled={busy} maxLength={200} onChange={value=>set(key,value||null)}/>;
 const relationButtons=(value:Choice|null,change:(choice:Choice)=>void,label:string)=><div className={styles.inclusion} role="group" aria-label={label}><span>{modes.entryMode==="total"?"全天总消耗":"活动合计"}是否已包含这项运动？</span><div>{([["included","已包含"],["additional","额外增加"]] as const).map(([choice,text])=><button key={choice} type="button" aria-pressed={value===choice} onClick={()=>change(choice)}>{text}</button>)}</div></div>;
 function submit(){
  if(draft.kind==="save_activity"||draft.kind==="restore_activity"){
   if(singleRequires&&!selectedRelation)return;
   save({...draft,...(baseline&&selectedRelation?{inclusion:selectedRelation}:{})});return;
  }
  if(draft.kind!=="save_energy_day"){save(draft);return;}
  if(saveBatch&&unresolved.length)return;
  const {restingKcal,activeKcal,totalKcal,...base}=draft;
  const dayAction:EnergyAction=modes.entryMode==="total"?{...base,entryMode:"total",activityMode:modes.activityMode,totalKcal:totalKcal??null}:{...base,entryMode:"components",activityMode:modes.activityMode,restingKcal:restingKcal??null,...(modes.activityMode==="total"?{activeKcal:activeKcal??"0"}:{})};
  if(!saveBatch){save(dayAction);return;}
  const changes:EnergyAction[]=[dayAction];
  for(const item of items){
   const {key,initialBasis,choiceBasis,inclusion,...action}=item;void key;void initialBasis;void choiceBasis;void inclusion;
   const choice=relation(item);changes.push({...action,date:draft.date,...(baseline&&choice?{inclusion:choice}:{})});
  }
  for(const row of activities.filter(row=>!row.deletedAt&&row.date===(initial.kind==="save_energy_day"?initial.date:draft.date)&&!items.some(item=>item.id===row.id)))changes.push({kind:"delete_activity",id:row.id,version:row.version});
  saveBatch(changes);
 }
 const retired=draft.kind.includes("energy_defaults")||draft.kind.includes("energy_profile");
 const targetDate="date" in draft?draft.date:originalActivity?.date;
 return <form className={styles.form} onSubmit={event=>{event.preventDefault();submit();}}><fieldset disabled={busy||retired}>
  {retired?<p role="alert">日常默认值和静息公式资料已停用，请取消这一项。</p>:draft.kind==="restore_activity"?<><h3>恢复 {originalActivity?.name??"活动"}</h3><p>{originalActivity?.date} · {energyValue(originalActivity?.caloriesKcal)} kcal</p>{baseline&&relationButtons(selectedRelation,value=>setSingleChoice({basis:baseline,value}),"恢复活动包含关系")}</>:draft.kind==="save_energy_day"||draft.kind==="save_activity"?<>
  <RecordDateContext date={draft.date} openedOn={openedOn}/>
  <div className={styles.editorTop}><label>日期<input aria-label="日期" type="date" required value={draft.date} onChange={event=>set("date",event.target.value)}/></label>{draft.kind==="save_energy_day"&&<div className={styles.modeSwitch} role="group" aria-label="消耗录入方式">{[["components","分开记录"],["total","只记总数"]].map(([mode,text])=><button type="button" key={mode} aria-pressed={modes.entryMode===mode} onClick={()=>set("entryMode",mode)}>{text}</button>)}</div>}</div>
  {draft.kind==="save_energy_day"?<>
   {modes.entryMode==="components"?<>
    <section className={styles.editorSection}><h3>静息消耗</h3><div className={styles.fields}>{field("restingKcal","静息 · kcal")}{source("restingSourceSystem","静息来源")}</div></section>
    <section className={styles.editorSection}><div className={styles.title}><h3>活动消耗</h3><div className={styles.modeSwitch} role="group" aria-label="活动记录方式">{[["total","记合计"],["activities","按运动累计"]].map(([mode,text])=><button type="button" key={mode} aria-pressed={modes.activityMode===mode} onClick={()=>set("activityMode",mode)}>{text}</button>)}</div></div>
     {modes.activityMode==="total"&&<div className={styles.fields}>{field("activeKcal","活动合计 · kcal","未记录活动时记 0")}{source("activeSourceSystem","活动来源")}</div>}
    </section>
   </>:<section className={styles.editorSection}><h3>全天总消耗</h3><div className={styles.fields}>{field("totalKcal","全天总消耗 · kcal","填写总数")}{source("sourceSystem","总消耗来源")}</div></section>}
   <section className={styles.editorSection}><div className={styles.title}><h3>运动明细 <small>可选</small></h3>{saveBatch&&baseline&&items.some(item=>item.completed!==false)&&<div className={styles.modeSwitch}><button type="button" onClick={()=>setItems(rows=>rows.map(item=>({...item,inclusion:"included",choiceBasis:baseline})))}>全部已包含</button><button type="button" onClick={()=>setItems(rows=>rows.map(item=>({...item,inclusion:"additional",choiceBasis:baseline})))}>全部额外增加</button></div>}</div>
   {saveBatch?<>{items.map((item,index)=><div className={styles.activityDraft} key={item.key}><div className={styles.title}><h4>运动 {index+1}</h4><button type="button" onClick={()=>setItems(rows=>rows.filter(row=>row.key!==item.key))}>移除运动 {index+1}</button></div><div className={styles.fields}>{([["name","运动名称","text"],["caloriesKcal","运动热量 · kcal","number"],["durationMinutes","运动时长 · 分钟","number"]] as const).map(([key,label,type])=><label key={key}>{label}<input aria-label={label+" "+(index+1)} type={type} min={type==="number"?0:undefined} max={type==="number"?1000000:undefined} step={type==="number"?"0.0001":undefined} maxLength={type==="text"?200:undefined} required={key==="name"} value={item[key]??""} onChange={event=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,[key]:event.target.value||(key==="name"?"":null)}:row))}/></label>)}<SourceInput label={"运动来源 "+(index+1)} sources={sources} removeSource={removeSource} disabled={busy} maxLength={200} value={item.sourceSystem??""} onChange={value=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,sourceSystem:value||null,sourceRecordId:null}:row))}/></div><label className={styles.checkbox}><input type="checkbox" checked={item.completed??true} onChange={event=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,completed:event.target.checked}:row))}/>已完成</label>
    {baseline&&item.completed!==false&&(needsRelation(item)||relation(item))&&relationButtons(relation(item),value=>setItems(rows=>rows.map(row=>row.key===item.key?{...row,inclusion:value,choiceBasis:baseline}:row)),"运动 "+(index+1)+" 包含关系")}
   </div>)}<button type="button" onClick={()=>setItems(rows=>[...rows,{key:crypto.randomUUID(),kind:"save_activity",date:draft.date,name:"",completed:true,timezone:draft.timezone}])}>＋ 添加运动</button></>:<>{items.map(item=><p key={item.key}>{item.name} · {energyValue(item.caloriesKcal)} kcal</p>)}<p className={styles.hint}>运动明细在对应审核项中修改和确认。</p></>}
   </section>
   <div className={styles.editorTotal} aria-live="polite"><span>当天总消耗<small>{modes.entryMode==="total"?"录入总数＋额外运动":"自动合计"}</small></span><strong>{energyValue(total)}<small>kcal</small></strong></div>
  </>:<><div className={styles.fields}><label>活动名称<input aria-label="活动名称" maxLength={200} required value={draft.name} onChange={event=>set("name",event.target.value)}/></label>{source("sourceSystem","活动来源")}{field("caloriesKcal","活动热量 · kcal")}{field("durationMinutes","时长 · 分钟","可选")}</div><label className={styles.checkbox}><input type="checkbox" checked={draft.completed??true} onChange={event=>set("completed",event.target.checked)}/>已完成</label>{baseline&&relationButtons(selectedRelation,value=>setSingleChoice({basis:baseline,value}),"活动包含关系")}</>}
  <details><summary>时间与备注</summary><div className={styles.fields}><label>时区<input aria-label="时区" maxLength={100} value={draft.timezone??""} onChange={event=>set("timezone",event.target.value)}/></label>{draft.kind==="save_energy_day"&&<label>备注<input aria-label="备注" maxLength={2000} value={draft.notes??""} onChange={event=>set("notes",event.target.value||null)}/></label>}</div></details>
  </>:null}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {(saveBatch&&unresolved.length>0||singleRequires&&!selectedRelation)&&<p role="status" className={styles.hint}>请选择运动是已包含还是额外增加，再保存。</p>}
  <button className={styles.save} type="submit" disabled={!!(saveBatch&&unresolved.length)||singleRequires&&!selectedRelation}>{busy?"正在保存…":submitLabel==="保存"&&targetDate?submitLabel+" · "+targetDate:submitLabel}</button>
 </fieldset></form>;
}
