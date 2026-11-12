export const TODAY = "2026-11-12", YESTERDAY = "2026-11-11";
export type Scene = "meal" | "welcome" | "photo" | "body" | "quote" | "sources" | "long" | "tool-error" | "partial" | "offline" | "timeout" | "service" | "login" | "context-limit" | "daily-limit" | "rate-limit" | "expired" | "conflict" | "duplicate" | "stale-source" | "unavailable";
export const scenes: [Scene,string][] = [["meal","补充食量"],["welcome","首次进入／空待办"],["photo","照片识别与追问"],["body","切换身体查询"],["quote","引用旧消息"],["sources","回答依据"],["long","长回答／截断"],["tool-error","查询失败"],["partial","部分查询成功"],["offline","网络断开"],["timeout","请求超时"],["service","服务暂不可用"],["login","登录失效"],["context-limit","当前对话长度上限"],["daily-limit","今日额度用完"],["rate-limit","请求过快"],["expired","预览过期"],["conflict","记录版本冲突"],["duplicate","重复提交"],["stale-source","引用依据已更新"],["unavailable","无法可靠回答"]];
export type Step = {label:string;tool:string;result:string;state?:"error"};
export type Source = {id:string;title:string;kind:"record"|"estimate"|"external";summary:string;date?:string;url?:string;stale?:boolean};
export type Preview = {id:string;date:string;title:string;detail:string;status:"pending"|"confirmed"|"expired"|"conflict"|"cancelled";noteOnly?:boolean};
export type Message = {id:string;role:"user"|"assistant";text:string;time:string;replyTo?:{id:string;text:string};date?:string;photo?:string;steps?:Step[];sources?:Source[];preview?:Preview;status?:"working"|"complete"|"stopped"|"truncated"|"error";error?:string};
export type Task = {date:string;rice:number|null;chicken?:number;origin:"meal"|"photo"};
export type Plan = {answer:string;steps:Step[];sources?:Source[];preview?:Preview;task?:Task;failure?:string;truncated?:boolean};
const mealRead:Step={label:"查询饮食记录",tool:"query_meals",result:"示例记录已返回。未知食量保持为空，没有推算克数。"};
export const amountQuestion="米饭150克已记住。鸡胸肉大约吃了多少？可以告诉我克数、块数，或实际吃的份量。";
export function seed(scene:Scene):Message[]{
 if(scene==="welcome")return [];
 if(scene==="quote")return [
  {id:"meal-09",role:"user",text:"11月9日晚饭，两碗饭和清蒸鱼，已经记好了。",date:"2026-11-09",time:"11月9日 19:30"},
  {id:"meal-09-reply",role:"assistant",text:"这份示例晚餐已在记录中。后续修改时，请告诉我需要改哪一项。",time:"11月9日 19:30",status:"complete"},
  {id:"meal-10",role:"user",text:"11月10日晚饭也记过了。",date:"2026-11-10",time:"11月10日 20:10"},
  {id:"quote-help",role:"assistant",text:"可以引用上面的11月9日消息，再告诉我“备注改成聚餐”。我会核对被引用的那一餐。",time:"今天 09:41",status:"complete"}
 ];
 if(scene==="meal")return [{id:"meal-request",role:"user",text:"午饭吃了米饭150克和鸡胸肉，帮我记一下。",date:TODAY,time:"09:41"},{id:"meal-question",role:"assistant",text:amountQuestion,steps:[mealRead],time:"09:41",status:"complete"}];
 return [{id:"scenario-start",role:"assistant",text:scene==="photo"?"选一张本地照片，或输入食物描述。我会先询问实际食量，再演示记录预览。照片只留在这个浏览器中。":"这个场景已准备好。发送下方示例问题，即可查看对应的回答与处理方式。",time:"09:41",status:"complete"}];
}
export const suggestions:Partial<Record<Scene,string>>={photo:"这顿饭帮我记一下",body:"最近七天体重怎么样？",sources:"昨天吃了什么？有哪些依据？",long:"帮我梳理这一周的记录",quote:"备注改成聚餐","tool-error":"查一下昨天的饮食",partial:"查一下昨天的饮食和消耗",unavailable:"仅凭这张照片能诊断身体情况吗？"};
export function planReply(text:string,scene:Scene,task:Task|null,quote:Message|null,withPhoto:boolean,operationId:string):Plan{
 const failures:Partial<Record<Scene,string>>={offline:"网络已断开。这条消息尚未完成处理，草稿与照片已保留。",timeout:"等待回复超时了。可以重试这条消息，已经生成的内容会保留。",service:"AI服务暂时不可用。稍后重试，或先用手工记录。",login:"登录已失效。重新登录后可以继续，当前输入会保留。","tool-error":"饮食查询未成功，我现在无法确认昨天有哪些记录。可以重试查询，或直接打开饮食页。"};
 if(failures[scene])return {answer:"",steps:[{...mealRead,result:"这一步未完成，没有把失败当作无记录。"}],failure:failures[scene]};
 if(scene==="unavailable")return {answer:"仅凭一张照片无法可靠判断身体状况。我可以帮你整理能看清的食物和你提供的实际食量；涉及身体判断时，需要可靠的实测信息。",steps:[]};
 if(/体重|身体|体脂/.test(text)||scene==="body")return {answer:"这组虚构实测记录中，11月6日为70.4kg，11月12日为70.2kg，首尾相差−0.2kg。中间缺测的日期保持为空，没有补值。\n这里只演示查询与依据展示，没有修改前面尚未完成的饮食任务。",steps:[{label:"查询近七天身体记录",tool:"query_measurements",result:"返回4个实测日、3个缺测日。没有创建或修改记录。"}],sources:[{id:"body-records",title:"近七天实测记录",kind:"record",date:"11月6日—12日",summary:"虚构数据：首日70.4kg、末日70.2kg；缺测日为空。"}]};
 if(quote){
  if(!quote.date)return {answer:"这条引用还不能确定要修改哪一份记录。请补充日期和餐次，我会先核对对象。",steps:[]};
  return {answer:"已按引用定位到"+quote.date+"晚餐。预览只把备注改为“聚餐”，保留原餐项和数量。最近提到的另一日晚餐没有改动。\n请打开预览核对，确认后才会保存。",steps:[{label:"核对被引用的晚餐",tool:"query_meals",result:"定位"+quote.date+"，沿用该记录版本，没有按最近话题选对象。"}],preview:{id:operationId,date:quote.date,title:"晚餐备注修改",detail:"备注：聚餐。原餐项、数量和营养保留。",status:"pending",noteOnly:true}};
 }
 if(scene==="partial")return {answer:"已查到昨天早餐和午餐的示例记录。消耗查询失败，暂时无法给出完整的能量对照。\n饮食结果仍可查看；缺少的消耗没有按0计算。",steps:[mealRead,{label:"查询昨日消耗",tool:"query_energy",state:"error",result:"查询失败，没有可用结果。可以单独重试。"}],sources:[{id:"yesterday-meals",title:"昨日饮食记录",kind:"record",date:YESTERDAY,summary:"早餐、午餐有记录；晚餐未确认是否记全。"}]};
 if(scene==="sources"||scene==="stale-source"||(/昨天.*(?:吃|饮食)|依据|来源/.test(text)&&!/补记|补录/.test(text)))return {answer:"昨天的示例记录里有早餐和午餐，晚餐还没有确认是否记全。已有记录只能说明记下了什么，不能据此认定没记录的食物就是没吃。\n可以去补录，也可以忽略这一天的提醒。",steps:[mealRead],sources:[{id:"yesterday-meals",title:"昨日饮食记录",kind:"record",date:YESTERDAY,summary:"虚构记录：早餐、午餐已记录，晚餐完整性未知。",stale:scene==="stale-source"},{id:"source-example",title:"外部资料示例",kind:"external",url:"https://www.who.int/news-room/fact-sheets/detail/healthy-diet",summary:"此项仅演示外部来源链接，不作为上面个人记录或营养数值的依据。"}]};
 if(scene==="long")return {answer:"先看记录是否完整，再考虑如何对照。\n饮食记录里，已经明确的实际食量应保留；只看到食物名称时，需要补充你吃了多少，不能默认一份或猜测克数。\n身体趋势只使用实测记录。缺测日保留空白，不通过插值补出体重。\n消耗与饮食的对照需要同一天、同一口径的数据。未知值不按0计算，已完成运动和未完成计划也分别处理。",steps:[mealRead,{label:"核对身体与消耗范围",tool:"query_measurements / query_energy",result:"查询完成；下面演示单次回答截断，不代表实际模型额度。"}],truncated:true};
 const amount=text.match(/(\d+(?:\.\d+)?)\s*(克|g)(?:\b|$|[，。 ])/i);
 if(task){
  const riceMatch=text.match(/米饭\s*(\d+(?:\.\d+)?)\s*(?:克|g)/i),chickenMatch=text.match(/鸡(?:胸肉|肉)?\s*(\d+(?:\.\d+)?)\s*(?:克|g)/i);
  const rice=riceMatch?Number(riceMatch[1]):task.rice;
  const chicken=chickenMatch?Number(chickenMatch[1]):task.chicken??(amount&&task.rice!==null&&!/米饭/.test(text)?Number(amount[1]):null);
  if(rice===null||chicken===null)return {answer:rice===null?(chicken?"鸡胸肉"+chicken+"克已记住。米饭实际吃了多少？":"还需要分别确认米饭和鸡胸肉的实际食量。这100克指哪一样？"):("米饭"+rice+"克已记住。鸡胸肉实际吃了多少？"),steps:[],task:{...task,rice,chicken:chicken??undefined}};
  if(rice>0&&chicken>0)return {answer:"好的，鸡胸肉按你补充的"+chicken+"克，米饭保留"+rice+"克。\n已生成"+(task.date===YESTERDAY?"昨天":"今天")+"午餐的演示预览，还没有正式保存。",steps:[{label:"保留已知食量并生成预览",tool:"preview_meal",result:"米饭"+rice+"克、鸡胸肉"+chicken+"克；只有一份待确认预览。"}],preview:{id:operationId,date:task.date,title:"午餐记录",detail:"米饭 "+rice+"克 · 鸡胸肉 "+chicken+"克。营养为虚构估算示例，确认前可修改。",status:scene==="expired"?"expired":scene==="conflict"?"conflict":"pending"},sources:[{id:"meal-estimate",kind:"estimate",title:"食量与估算依据",summary:"食量来自本段用户输入，营养只用于演示；没有进行真实照片识别或食品成分核验。"}]};
 }

 if(withPhoto||scene==="photo"||/米饭|鸡|记.*餐|补记|补录/.test(text)||["expired","conflict","duplicate"].includes(scene)){
  const date=/11月11|昨天/.test(text)?YESTERDAY:TODAY;
  return {answer:withPhoto?"照片已在本地读取。这里先演示识别出米饭和鸡胸肉，但无法从照片可靠确认实际食量。\n米饭吃了多少？鸡胸肉吃了多少？可以用克数、块数或实际份数描述。":amountQuestion,steps:withPhoto?[{label:"读取本地照片",tool:"photo_preview",result:"照片未上传；识别内容为预设演示，不是真实视觉模型输出。"}]:[mealRead],task:{date,rice:withPhoto?null:150,origin:withPhoto?"photo":"meal"}};
 }
 return {answer:"可以告诉我想查看的日期，或描述需要补记的食物和实际食量。\n这个本地原型支持体验补充食量、引用旧消息、查询依据和提醒处理。它没有连接真实模型或你的健康记录。",steps:[]};
}
