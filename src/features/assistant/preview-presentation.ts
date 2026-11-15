import {category,isBody,type RecordReviewView} from "../records/model";
/** 同一正式对象的重复已保存回执保留最新一份；未知目标绝不按日期或数值猜测合并。 */
export function savedPreviewTargets(view:RecordReviewView):string|null{
  if(view.status!=="confirmed")return null;
  const rows=view.rows.filter(row=>row.persisted);if(!rows.length)return null;
  const targets:string[]=[];
  for(const row of rows){
    if(isBody(row.action)){const after=row.body?.preview.rows[0]?.after;if(typeof after?.id!=="string"||typeof after.version!=="string")return null;targets.push("body:"+after.id+":"+after.version);continue;}
    const record=row.meal?.meal??row.meal?.food??row.energy?.after??row.training?.after;
    const id=record&&"id" in record&&typeof record.id==="string"?record.id:row.trainingEntityId;
    const version=record&&"version" in record?record.version:null;
    if(!id||!(typeof version==="number"&&Number.isSafeInteger(version)&&version>0))return null;targets.push(category(row.action)+":"+id+":"+version);
  }
  return [...new Set(targets)].sort().join("|");
}
export function redundantSavedPreviews(views:RecordReviewView[]){
  const latest=new Map<string,RecordReviewView>(),hidden=new Set<string>();
  for(const view of views){const key=savedPreviewTargets(view);if(!key)continue;const prior=latest.get(key);if(!prior){latest.set(key,view);continue;}if(Date.parse(view.createdAt)>=Date.parse(prior.createdAt)){hidden.add(prior.id);latest.set(key,view);}else hidden.add(view.id);}
  return hidden;
}
