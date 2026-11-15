import type {ChatMessage,ChatReference} from "./chat-model";

/** 只改变站内呈现；原话、预览和外部确认协议不改写。 */
export function chatDisplayText(message:Pick<ChatMessage,"role"|"text"|"references">,inline:boolean){
  if(message.role!=="assistant"||!inline)return message.text;
  const ids=new Set(message.references.filter(ref=>ref.kind==="preview"&&ref.operationId).map(ref=>ref.operationId!));
  if(!ids.size)return message.text;
  const ownLink=(href:string)=>{try{const path=new URL(href,"https://formward.invalid").pathname;return [...ids].some(id=>path==="/dashboard/ai/operations/"+id);}catch{return false;}};
  const text=message.text.replace(/\[([^\]]*)\]\(([^\s)]+)\)/g,(whole,label:string,href:string)=>ownLink(href)?"":whole)
    .replace(/https?:\/\/[^\s<>]+|\/dashboard\/ai\/operations\/[^\s<>]+/g,whole=>ownLink(whole.replace(/[，。；：）]+$/g,""))?"":whole);
  return text.split(/\n\s*\n/).filter(block=>{
    const value=block.trim();
    return value&&!/^(?:请打开链接(?:登录)?确认|请在当前界面核对后确认|这条修改还是待确认草稿)/.test(value);
  }).join("\n\n").replace(/确认前它仍是待审草稿[。；]?\s*/g,"").replace(/请打开提交检查[^。\n]*[。]?/g,"").replace(/的待确认预览/g,"记录内容").replace(/待审草稿/g,"记录内容").trim();
}
export function chatRecordReferences(references:ChatReference[],inline:boolean,steps:{name:string}[]=[]){
  const previews=inline&&references.some(ref=>ref.kind==="preview"&&ref.operationId);
  const pages:Record<string,string>={preview_meals:"meals",preview_foods:"meals",preview_measurements:"measurements",preview_energy:"energy",preview_training:"training"};
  const covered=new Set(steps.flatMap(step=>pages[step.name]?["/dashboard/"+pages[step.name]]:[]));
  const seen=new Set<string>();
  return references.filter(ref=>{if(seen.has(ref.href)||previews&&(ref.kind==="preview"||covered.has(ref.href.split("?")[0])))return false;seen.add(ref.href);return true;});
}
