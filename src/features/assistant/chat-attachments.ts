import {createHash} from "node:crypto";
import {and,eq} from "drizzle-orm";
import type {Database} from "../../db/client";
import {assistantMessage,assistantRun,mealImage} from "../../db/schema";
import {ApiError} from "../auth/ai-identity";
import {imageMime,loadMealImage} from "../meals/images";
import type {ChatExecutionInput} from "./chat-model";
type Question=Pick<typeof assistantMessage.$inferSelect,"id"|"conversationId"|"imageIds"|"replyToId"|"text">;
export async function chatAttachmentBinding(db:Database,userId:string,question:Question,followupSourceId?:string){
 let source=question;
 const read=async(id:string)=>{const [row]=await db.select().from(assistantMessage).where(and(eq(assistantMessage.id,id),eq(assistantMessage.userId,userId),eq(assistantMessage.conversationId,question.conversationId)));return row;};
 if(!question.imageIds.length&&question.replyToId){const quoted=await read(question.replyToId);if(quoted?.role==="user")source=quoted;else if(quoted){const [run]=await db.select().from(assistantRun).where(and(eq(assistantRun.assistantMessageId,quoted.id),eq(assistantRun.userId,userId),eq(assistantRun.conversationId,question.conversationId))).orderBy(assistantRun.createdAt).limit(1);if(run)source=await read(run.userMessageId)??question;}}
 if(!source.imageIds.length&&!question.replyToId&&followupSourceId)source=await read(followupSourceId)??question;
 return {attachmentSourceId:source.id,attachmentImageIds:[...source.imageIds]};
}
export async function chatImageContent(db:Database,userId:string,text:string,binding:Pick<ChatExecutionInput,"attachmentSourceId"|"attachmentImageIds">,loader=loadMealImage){
 const images:{id:string;sha256:string;byteSize:number;mimeType:string}[]=[];
 if(!binding.attachmentImageIds.length)return {content:text,images};
 const content:({type:"text";text:string}|{type:"image_url";image_url:{url:string}})[]=[{type:"text",text}];
 for(const id of binding.attachmentImageIds){
  const [stored]=await db.select().from(mealImage).where(and(eq(mealImage.id,id),eq(mealImage.userId,userId)));
  if(!stored)throw new ApiError(404,"image_unavailable","本条消息的照片不存在或不属于当前账号，未发送模型请求。");
  const {stream,mimeType}=await loader(db,userId,id),reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>20*1024*1024)throw new ApiError(413,"image_too_large","照片超过20MiB，未发送模型请求。");chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=Buffer.concat(chunks);
  if(!bytes.length||bytes.length>20*1024*1024)throw new ApiError(413,"image_too_large","照片为空或超过20MiB，未发送模型请求。");
  let actualMime:string;try{actualMime=imageMime(bytes);}catch{throw new ApiError(400,"invalid_image","照片格式无效，未发送模型请求。");}
  const sha256=createHash("sha256").update(bytes).digest("hex");
  if(actualMime!==mimeType||mimeType!==stored.mimeType||sha256!==stored.sha256||bytes.length!==stored.byteSize)throw new ApiError(409,"image_integrity","照片读取内容与登记不一致，未发送模型请求。请保留原图并重新上传。");
  images.push({id,sha256,byteSize:bytes.length,mimeType});content.push({type:"image_url",image_url:{url:"data:"+mimeType+";base64,"+bytes.toString("base64")}});
 }
 return {content,images};
}
