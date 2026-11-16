import type {ChatMessage,ChatReference} from "./chat-model";

const reviewHosts=new Set(["formward.top","www.formward.top","global.formward.top","formward-ten.vercel.app","43.142.148.58","localhost","127.0.0.1","formward.invalid"]);
function reviewLink(href:string){
 try{const url=new URL(href.replace(/[.,;:!?)，。；：、）》）\]>*`]+$/g,""),"https://formward.invalid");return reviewHosts.has(url.hostname)&&/^\/dashboard\/ai\/operations\/[\w-]+\/?$/.test(url.pathname);}catch{return false;}
}
function businessFacts(text:string){return /\d+(?:[.,]\d+)?\s*(?:kg|kcal|g\b|ml\b|千卡|千克|公斤|毫升|克|份|碗|个|步|次|组|分钟|公里)/i.test(text)||/(?:来源|时区|依据|备注|空腹|照片|原图|附件)/.test(text);}
/** 只改变站内呈现；原话、预览和外部确认协议不改写。历史文案不作为当前提交状态。 */
export function chatDisplayText(message:Pick<ChatMessage,"role"|"text"|"references">,inline:boolean){
 if(message.role!=="assistant"||!inline)return message.text;
 const hasPreview=message.references.some(ref=>ref.kind==="preview"&&ref.operationId);
 let reviewRemoved=message.references.some(ref=>reviewLink(ref.href));
 const clean=(part:string)=>{
  // 围栏代码是非导航的原文；不删除代码示例或普通外部引用。
  if(/^(?:```|~~~)/.test(part))return part;
  const text=part.replace(/<([^<>\s]+)>/g,(whole,href:string)=>{if(!reviewLink(href))return whole;reviewRemoved=true;return "";}).replace(/(\/dashboard\/ai\/operations\/)\s*\n\s*([\w-]+)/g,"$1$2")
   .replace(/\[([^\]]*)\]\(([^\s)]+)\)/g,(whole,label:string,href:string)=>{if(!reviewLink(href))return whole;reviewRemoved=true;return businessFacts(label)?label:"";})
   .replace(/https?:\/\/[^\s<>]+|\/dashboard\/ai\/operations\/[^\s<>]+/g,whole=>{if(!reviewLink(whole))return whole;reviewRemoved=true;return "";});
  return text.split("\n").map(line=>{
   if(/^\s*(?:确认|审核|预览)(?:链接|入口)[：:]?\s*$/.test(line)){reviewRemoved=true;return "";}
   return (line.match(/[^。！？；]+[。！？；]?/g)??[]).map(sentence=>{
    const plain=sentence.replace(/[*_`]/g,"").replace(/^\s*(?:[-+]|\d+[.)])\s+/,"").trim();
    if(!businessFacts(plain)&&/^先(?:调起|调用).*(?:能力|工具)[。！？]?$/.test(plain))return "";
    const direct=/^确认前.*待(?:审|确认)|^这条修改还是待确认草稿|^(?:目前|现在|当前|这条|本次)(?:还|尚|仍)?(?:没有|未|没)(?:正式)?(?:保存|写入)(?:[，,。；;]|$)/.test(plain);
    const prefix=/^(?:(?:好的|补一句|注)[，,:：]\s*)?(?:请|目前|现在|当前|这条|这轮|这批|这份|刚才|我|你那边|下面|确认链接|审核链接|预览链接|过期)/.test(plain);
    const intent=/(?:确认|审核|预览|草稿).*(?:链接|入口|保存|有效|过期|状态|正式写入|待确认)|(?:链接|网页登录|登录后).*(?:确认|保存)|过期.*(?:重新|没关系)|卡片.*链接/.test(plain);
    if(!businessFacts(plain)&&(direct||prefix&&intent)){reviewRemoved=true;return "";}
    // 去掉旧回复围绕同一事实的“重新给链接”包装，保留括号内原始业务内容。
    const wrapped=sentence.match(/^(?:好的[，,]\s*)?我(?:这就)?按同样内容[（(]([\s\S]+)[）)]重新生成一条带确认链接的预览[，,]\s*稍等[。]?$/);
    let result=wrapped?wrapped[1]+"。":sentence;
    if(hasPreview||reviewRemoved)result=result.replace(/带确认链接的(?:版本|预览)/g,"记录内容").replace(/的待确认预览(?=[：:，。])/g,"记录内容");
    if(hasPreview)result=result.replace(/[，,]\s*(?:如果你想|想留|可在|请在)[^。；]*(?:网页)?确认页里(?:补传|上传|补充)[^。；]*/g,"");
    return result;
   }).join("");
  }).join("\n").replace(/^说明(?:两点|几点)[：:]\s*$/gm,"说明：");
 };
 const text=message.text.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/g).map(clean).join("").replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,"\n\n").trim();
 return reviewRemoved&&!hasPreview&&!text.includes("AI 确认")?[text,"提交状态可在「AI 确认」中查看。"].filter(Boolean).join("\n\n"):text;
}
export function chatRecordReferences(references:ChatReference[],inline:boolean,steps:{name:string}[]=[]){
 const previews=inline&&references.some(ref=>ref.kind==="preview"&&ref.operationId);
 const pages:Record<string,string>={preview_meals:"meals",preview_foods:"meals",preview_measurements:"measurements",preview_energy:"energy",preview_training:"training"};
 const covered=new Set(steps.flatMap(step=>pages[step.name]?["/dashboard/"+pages[step.name]]:[]));
 const seen=new Set<string>();
 return references.filter(ref=>{if(seen.has(ref.href)||inline&&reviewLink(ref.href)||previews&&(ref.kind==="preview"||covered.has(ref.href.split("?")[0])))return false;seen.add(ref.href);return true;});
}
