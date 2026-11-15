import { withCurrentSession } from "@/features/auth/server";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { getDatabase } from "@/db/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { safeAiError } from "@/features/measurements/ai-api";
import { assertChatAllowed } from "@/features/assistant/chat-config";
import { readChatJson } from "@/features/assistant/chat-request";
import { chatRunStream } from "@/features/assistant/chat-stream";
import { abortChatRun } from "@/features/assistant/chat-runtime";
import { mealTaskInputSchema, createMealTask, controlMealTask, mealTaskSnapshot, startMealTaskRun, applyMealTask, saveMealTask, changeMealModelGrant } from "@/features/assistant/meal-task";
import { assistantTimezone } from "@/features/assistant/model";

export const runtime="nodejs";
export const maxDuration=600;
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
 try{return await withCurrentSession(request.headers,async owner=>{
  assertChatAllowed(owner,"meal_entry");const id=new URL(request.url).searchParams.get("taskId");
  if(!z.string().uuid().safeParse(id).success)return Response.json({error:"任务编号无效。"},{status:400,headers});
  return Response.json(await mealTaskSnapshot(getDatabase(),owner.id,id!),{headers});
 });}catch(error){const failure=safeAiError(error);return Response.json({error:failure.error.message,code:failure.error.code},{status:failure.status,headers});}
}
export async function POST(request:Request){
 if(!isAccountRequestOrigin(request.headers))return Response.json({error:"请求来源无效。"},{status:403,headers});
 try{return await withCurrentSession(request.headers,async owner=>{
  assertChatAllowed(owner,"meal_entry");const parsed=mealTaskInputSchema.safeParse(await readChatJson(request,200000));
  if(!parsed.success)return Response.json({error:"饮食任务格式无效，请核对填写内容。"},{status:400,headers});
  const input=parsed.data,db=getDatabase();
  if(input.action==="create"){const id=await createMealTask(db,owner.id,input.draftKey,input.draft);return Response.json(await mealTaskSnapshot(db,owner.id,id),{headers});}
  if(input.action==="run"){
   const {input:prepared,started}=await startMealTaskRun(db,owner.id,{...input,timezone:assistantTimezone(input.timezone)});
   return new Response(chatRunStream(db,owner.id,prepared,request,started),{headers:{...headers,"Content-Type":"text/event-stream; charset=utf-8","X-Accel-Buffering":"no"}});
  }
  if(input.action==="enable_model"||input.action==="revoke_model")return Response.json(await changeMealModelGrant(db,owner.id,input.taskId,input.provider,input.action==="enable_model"),{headers});
  if(input.action==="save"){const result=await saveMealTask(db,owner.id,input.taskId,input.revision,input.draft);revalidatePath("/dashboard","layout");return Response.json(result,{headers});}
  if(input.action==="apply")return Response.json(await applyMealTask(db,owner.id,input.taskId),{headers});
  const result=await controlMealTask(db,owner.id,input.taskId,input.action==="cancel");
  if(result.stoppedRunId)abortChatRun(result.stoppedRunId);
  return Response.json(result.snapshot,{headers});
 });}catch(error){const failure=safeAiError(error);return Response.json({error:failure.error.message,code:failure.error.code},{status:failure.status,headers});}
}
