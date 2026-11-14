// 仅迁移已有协议测试素材；返回值保持真实V2响应，生产入口没有旧工具转接。
import type { Client } from "@modelcontextprotocol/client";
type Data = Record<string, unknown>;
const omit = (value: Data, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
function simpleFood(item: Data) {
  const common = Object.fromEntries(["name","kind","quantity","unit","amountDecision","foodId","foodVersion","basis"].filter(key => item[key] !== undefined).map(key => [key,item[key]]));
  if (item.foodId) return common;
  return { ...common, nutritionBasis:item.nutritionBasis, ...(item.nutritionBasis === "per_portion" ? item.perPortionNutrition as Data : item.nutrition as Data), sourceKind:item.sourceKind, evidenceUrl:item.evidenceUrl };
}
export function withV2McpFixtures(client: Client): Client {
  const call = client.callTool.bind(client);
  client.callTool = (async (input, ...rest) => {
    let name=input.name,args:Data={...(input.arguments??{})};
    const platform=Object.fromEntries(["from_mcp_call","_miniapp_permitted_data"].filter(key=>key in args).map(key=>[key,args[key]])); for(const key of Object.keys(platform))delete args[key];
    if (name === "preview_meals" && !args.meals && args.date) {
      const {operationId,...meal}=args; args={operationId,meals:[meal]};
    } else if (name === "preview_energy" && !args.days && args.date) {
      const {operationId,...day}=args; args={operationId,days:[day]};
    } else if (name === "preview_meal_changes" && !args.changes) {
      const {operationId,previewId,revision,key,...patch}=args;
      if(previewId) {name="update_preview";args={operationId,id:previewId,revision,changes:[{key:key??"meal-0",kind:"save_meal",...patch}]};}
      else args={operationId,changes:[patch]};
    } else if (name === "preview_record_bundle") {
      const items=(args.items??args.actions) as Data[]|undefined;
      if (Array.isArray(items)) {
        const entries:Data[]=items.map((item,index)=>({key:typeof item.key==="string"?item.key:`item-${index}`,...item}));
        const kinds=new Set(entries.map(item=>String(item.kind).startsWith("save_training")||item.kind==="schedule_training"?"training":item.kind==="save_record"?"body":item.kind==="save_meal"?"meal":item.kind==="save_food"?"food":String(item.kind).includes("energy")||item.kind==="save_activity"?"energy":item.kind));
        if(kinds.size===1 && kinds.has("body")){name="preview_measurements";args={operationId:args.operationId,timezone:args.timezone,items:entries};}
        else if(kinds.size===1 && kinds.has("training")){name="preview_training";args={operationId:args.operationId,timezone:args.timezone,items:entries};}
        else if(kinds.size===1 && kinds.has("food")){name="preview_foods";args={operationId:args.operationId,foods:entries.map(item=>omit(item,["kind"]))};}
        else if(kinds.size===1 && kinds.has("meal") && entries.every(item=>!item.id)) {name="preview_meals";args={operationId:args.operationId,meals:entries.map(item=>({...omit(item,["kind","items"]),foods:(item.items as Data[]).map(simpleFood)}))};}
        else if(kinds.size===1 && kinds.has("energy")) {
          name="preview_energy";const days=new Map<unknown,Data>();for(const item of entries){const day=days.get(item.date)??{date:item.date,timezone:item.timezone,activities:[]};if(item.kind==="save_energy_day")Object.assign(day,omit(item,["key","kind","id","version"]),item.id?{dayId:item.id,dayVersion:item.version}:{});else(day.activities as Data[]).push(omit(item,["key","kind","date","timezone","completed"]));days.set(item.date,day);}args={operationId:args.operationId,days:[...days.values()]};
        } else args={operationId:args.operationId,timezone:args.timezone,items:entries};
      }
    }
    return call({...input,name,arguments:{...args,...platform}},...rest);
  }) as Client["callTool"];
  return client;
}
