import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { get, put, del } from "@vercel/blob";
import { z } from "zod";
import { mealImage } from "../../db/schema";
import type { Database } from "../../db/client";
import { lockOwner } from "../auth/owner-lock";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const openAiFileSchema = z.object({ download_url: z.string().url(), file_id: z.string().min(1).max(200), mime_type: z.string().optional(), file_name: z.string().max(255).optional() }).strict();
export const imageImportSchema = z.object({ files: z.array(openAiFileSchema).min(1).max(8) }).strict();
export function imageMime(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413,"image_size","照片最大4 MiB，请选择大小符合要求的原图。");
  const b=Buffer.from(bytes);
  if (b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (b[0]===255 && b[1]===216 && b[2]===255) return "image/jpeg";
  if (b.subarray(0,4).toString()==="RIFF" && b.subarray(8,12).toString()==="WEBP") return "image/webp";
  throw new ApiError(400,"image_type","支持 JPEG、PNG 和 WebP 原图，不接受其他文件类型。");
}
export function validateImageDownloadUrl(value: string) {
  const url=new URL(value);
  const allowed=["oaiusercontent.com","chatgptusercontent.com","openai.com"];
  if (url.protocol!=="https:" || url.username || url.password || (url.port && url.port!=="443") || !allowed.some(host=>url.hostname===host || url.hostname.endsWith(`.${host}`))) throw new ApiError(400,"image_url","照片须来自 ChatGPT 的文件下载地址；其他客户端请使用网页补传。");
  return url;
}
export async function downloadMealImage(value: string, fetcher:typeof fetch=fetch): Promise<Uint8Array> {
  let url=validateImageDownloadUrl(value);
  const signal=AbortSignal.timeout(15_000);
  for (let hop=0;hop<4;hop++) {
    const response=await fetcher(url,{redirect:"manual",signal,cache:"no-store"});
    if ([301,302,303,307,308].includes(response.status)) { const location=response.headers.get("location"); await response.body?.cancel(); if (!location) break; url=validateImageDownloadUrl(new URL(location,url).href); continue; }
    if (!response.ok || !response.body) throw new ApiError(400,"image_download","照片下载失败或地址已过期，请重新传入文件或在审核页补传。");
    if (Number(response.headers.get("content-length"))>MAX_IMAGE_BYTES) { await response.body.cancel(); throw new ApiError(413,"image_size","照片最大4 MiB。"); }
    const reader=response.body.getReader(), chunks:Uint8Array[]= []; let size=0;
    try { for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>MAX_IMAGE_BYTES) throw new ApiError(413,"image_size","照片最大4 MiB。"); chunks.push(value); } }
    finally { await reader.cancel().catch(()=>{}); }
    return Buffer.concat(chunks);
  }
  throw new ApiError(400,"image_download","照片下载重定向过多，请重新上传。");
}
// 仅替换实际存储与清理函数供隔离测试使用，不增加业务分层。
export async function saveMealImage(db:Database,userId:string,bytes:Uint8Array, metadata:{fileName:string;source:"manual"|"ai";sourceFileId?:string;actorId:string;identity?:AiIdentity}, store=async(pathname:string,content:Uint8Array,mimeType:string)=>{await put(pathname,Buffer.from(content),{access:"private",contentType:mimeType,addRandomSuffix:false});}, remove=async(pathname:string)=>{await del(pathname);}) {
  const mimeType=imageMime(bytes), sha256=createHash("sha256").update(bytes).digest("hex");
  let uploaded:string|undefined;
  try { return await db.transaction(async tx=>{
    await lockOwner(tx,userId);
    if(metadata.source==="ai"){if(!metadata.identity||metadata.identity.userId!==userId)throw new ApiError(401,"invalid_token","缺少饮食授权。");await requireActiveAiToken(tx,metadata.identity,true,"meals");}
    const [prior]=await tx.select().from(mealImage).where(and(eq(mealImage.userId,userId),eq(mealImage.sha256,sha256)));
    if(prior) return {id:prior.id,mimeType:prior.mimeType,fileName:prior.fileName,repeated:true};
    const id=randomUUID(), pathname=`meals/${userId}/${id}`;
    await store(pathname,bytes,mimeType); uploaded=pathname;
    const fileName=metadata.fileName.replace(/[\x00-\x1f\x7f/\\]/g,"_").slice(0,255)||"照片";
    await tx.insert(mealImage).values({id,userId,pathname,sha256,mimeType,byteSize:bytes.length,fileName,source:metadata.source,sourceFileId:metadata.sourceFileId??null,createdBy:metadata.actorId});
    return {id,mimeType,fileName,repeated:false};
  }); } catch(error) { if(uploaded) await remove(uploaded).catch(()=>{}); if(error instanceof ApiError)throw error;throw new ApiError(503,"image_unavailable","私有照片存储未配置或暂时不可用，请稍后重试。原图尚未保存。"); }
}
export async function importMealImages(db:Database,identity:AiIdentity,input:unknown) {
 const parsed=imageImportSchema.safeParse(input); if(!parsed.success) throw new ApiError(400,"invalid_input","请传入1–8张 ChatGPT 文件照片。");
 await db.transaction(tx=>requireActiveAiToken(tx,identity,true,"meals"));
 const userId=identity.userId,actorId=identity.tokenId??identity.oauthConnectionId!;
 const images=[];
 for(const file of parsed.data.files) images.push(await saveMealImage(db,userId,await downloadMealImage(file.download_url),{fileName:file.file_name??"照片",source:"ai",sourceFileId:file.file_id,actorId,identity}));
 return {images,rules:"原图已私有保存，正式餐次／食材尚未保存。使用返回的id作为imageIds。仅图片须先询问日期、餐次、食物、实际食用量和额外油酱；通过网页预览确认保存。"};
}
export async function ownedMealImage(db:Pick<Database,"select">,userId:string,id:string) {
 const [image]=await db.select().from(mealImage).where(and(eq(mealImage.userId,userId),eq(mealImage.id,id)));
 if(!image) throw new ApiError(404,"not_found","照片不存在。"); return image;
}
export async function loadMealImage(db:Database,userId:string,id:string) {
 const image=await ownedMealImage(db,userId,id);
 try {const result=await get(image.pathname,{access:"private"});
 if(!result || result.statusCode!==200)throw new ApiError(404,"not_found","原图暂不可读取，请稍后重试。");
 return {stream:result.stream,mimeType:image.mimeType};
 }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,"image_unavailable","原图暂不可读取，请稍后重试。");}
}
