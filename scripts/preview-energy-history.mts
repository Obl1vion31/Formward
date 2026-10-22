import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { z } from "zod";
import { createDatabase } from "../src/db/client";
import { authenticateAi } from "../src/features/auth/ai-tokens";
import { listMeasurements } from "../src/features/measurements/records";
import { readMealSnapshot } from "../src/features/meals/records";
import { readEnergySnapshot } from "../src/features/activities/records";
import { energyHistoryActions } from "../src/features/activities/history";
import type { EnergyAction } from "../src/features/activities/model";

const [filename, mode = "--preview"] = process.argv.slice(2), root = resolve("data/exports"), path = resolve(filename ?? ".");
if (!["--preview", "--stage"].includes(mode) || relative(root,path).startsWith("..") || path === root || !path.endsWith(".json")) throw new Error("用法：node --env-file=.env.local --import tsx scripts/preview-energy-history.mts data/exports/私有请求.json --preview|--stage");
const input = z.object({ userId:z.string().uuid(), operationId:z.string().regex(/^[a-zA-Z0-9-]{8,120}$/), baseURL:z.string().url(), from:z.string().optional(), to:z.string(), restingKcal:z.string(), restingSourceSystem:z.string().nullable().optional(), cleanupDate:z.string(), cleanupRecord:z.object({id:z.string().uuid(),version:z.number().int().positive(),expectedRestingKcal:z.string()}).optional() }).strict().parse(JSON.parse(await readFile(path,"utf8")));
const base = new URL(input.baseURL); if(base.protocol!=="https:"||base.username||base.password||base.pathname!=="/"||base.search||base.hash)throw new Error("预览需使用正式HTTPS根地址。");
process.loadEnvFile(".env.ai.local");
const rawToken = process.env.FORMWARD_AI_TOKEN;
if(!rawToken) throw new Error("缺少已有AI访问配置。");
const database=createDatabase(process.env.DATABASE_URL!);
const stem=path.slice(0,-5);
async function privateFile(filename:string,data:unknown){const content=JSON.stringify(data,null,2)+"\n";try{await writeFile(filename,content,{mode:0o600,flag:"wx"});}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST"||await readFile(filename,"utf8")!==content)throw error;}}
try {
  const identity=await authenticateAi(database.db,`Bearer ${rawToken}`);
  if(identity.userId!==input.userId||identity.permission!=="write")throw new Error("令牌账号或写入权限不匹配。");
  const snapshot=await readEnergySnapshot(database.db,input.userId), measurements=await listMeasurements(database.db,input.userId), meals=await readMealSnapshot(database.db,input.userId);
  const dates=[...measurements.filter(row=>!row.deletedAt).map(row=>row.recordDate),...meals.meals.filter(row=>!row.deletedAt).map(row=>row.date),...snapshot.days.filter(row=>!row.deletedAt).map(row=>row.date),...snapshot.activities.filter(row=>!row.deletedAt).map(row=>row.date)].sort();
  const from=input.from??dates[0]; if(!from||from>input.to)throw new Error("没有可初始化的历史范围。");
  const actions:EnergyAction[]=energyHistoryActions(snapshot,{from,to:input.to,restingKcal:input.restingKcal,...(input.restingSourceSystem===undefined?{}:{restingSourceSystem:input.restingSourceSystem})});
  const cleanup=snapshot.days.find(row=>row.date===input.cleanupDate&&!row.deletedAt);
  if(input.cleanupRecord){const expected=input.cleanupRecord;if(!cleanup||cleanup.id!==expected.id||cleanup.version!==expected.version||Number(cleanup.restingKcal)!==Number(expected.expectedRestingKcal))throw new Error("误加值清理目标或版本已变化，须重新核对预览。");actions.push({kind:"save_energy_day",id:cleanup.id,version:cleanup.version,date:cleanup.date,restingKcal:null,restingEstimated:false,restingSourceSystem:null});}
  else if(cleanup?.restingKcal!=null)throw new Error("清理日有正式静息记录，须核对来源并明确cleanupRecord，不能仅凭日期删除。");
  if(!actions.length)throw new Error("没有需要保存的历史缺项。");
  const payload={operationId:input.operationId,items:actions.map((action,index)=>({key:`energy-${index+1}`,...action}))};
  const report={from,to:input.to,actionCount:actions.length,cleanupDate:input.cleanupDate,cleanupHadPersistedResting:cleanup?.restingKcal!=null,cleanupAction:!!input.cleanupRecord,originalSnapshot:snapshot,payload};
  await privateFile(stem+".preview.json",report);await privateFile(stem+".record-request.json",payload);
  if(mode==="--stage"){
    const response=await fetch(new URL("/api/v1/record-operations",base),{method:"POST",redirect:"error",signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${rawToken}`,"Content-Type":"application/json","X-Formward-Timezone":"Asia/Shanghai"},body:JSON.stringify(payload)});
    const operation=await response.json();if(!response.ok)throw new Error(`正式预览提交失败（HTTP ${response.status}）：${operation.error?.message??operation.error?.code??"请检查私有结果"}`);
    await privateFile(stem+".operation.json",operation);
    console.log(JSON.stringify({status:operation.status,actions:actions.length,confirmationUrl:operation.confirmationUrl??new URL(`/dashboard/ai/operations/${operation.id}`,base).href}));
  } else console.log(JSON.stringify({status:"preview-only",actions:actions.length,from,to:input.to,cleanupHadPersistedResting:cleanup?.restingKcal!=null}));
} finally {await database.close();}
