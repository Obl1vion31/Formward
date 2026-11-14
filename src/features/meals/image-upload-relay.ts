import {createHash} from "node:crypto";
import {z} from "zod";
import type {Database} from "@/db/client";
import {ApiError} from "../auth/ai-identity";
import {assertImageTicket} from "./image-upload";
import {verifyImageUploadTicket} from "./image-ticket";
import {imageStorage,type ImageStorage} from "./image-storage";
import {imageMime,MAX_IMAGE_BYTES} from "./image-bytes";

export async function readRelayImage(request:Request,expectedSize:number,timeoutMs=120000){
 if(!request.body||expectedSize<=0||expectedSize>MAX_IMAGE_BYTES||Number(request.headers.get("content-length"))>MAX_IMAGE_BYTES)throw new ApiError(413,"image_size","照片须为非空文件，最大20 MiB。");
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
 let rejectAbort:(reason:unknown)=>void=()=>{};
 const abort=()=>{rejectAbort(new ApiError(408,"image_interrupted","照片传输已中断，请重试。"));void reader.cancel().catch(()=>{});};
 const interrupted=new Promise<never>((_,reject)=>{rejectAbort=reject;timer=setTimeout(abort,timeoutMs);});
 request.signal.addEventListener("abort",abort,{once:true});
 try{
  if(request.signal.aborted)throw new ApiError(408,"image_interrupted","照片传输已中断，请重试。");
  for(;;){const part=await Promise.race([reader.read(),interrupted]);if(part.done)break;size+=part.value.byteLength;if(size>expectedSize||size>MAX_IMAGE_BYTES)throw new ApiError(413,"image_size","照片实际大小与上传凭据不一致。");chunks.push(part.value);}
  if(size!==expectedSize)throw new ApiError(400,"image_mismatch","照片未完整传输，请重试。");
  return Buffer.concat(chunks,size);
 }finally{clearTimeout(timer);request.signal.removeEventListener("abort",abort);void reader.cancel().catch(()=>{});}
}
/** 仅国内 Node 部署的人工恢复通道；旧 multipart 与国际直传不变。 */
export async function relayImageUpload(db:Database,userId:string,request:Request,dependencies:{secret?:string;storage?:ImageStorage}={}){
 if(process.env.FORMWARD_IMAGE_REGION!=="cn"&&!dependencies.storage)throw new ApiError(404,"image_relay_unavailable","当前入口请使用原图直传。");
 const raw=request.headers.get("x-image-upload-ticket")??"";
 if(raw.length>4096)throw new ApiError(400,"image_ticket","上传凭据无效。");
 const ticket=verifyImageUploadTicket(raw,userId,dependencies.secret);
 if(ticket.provider!=="cos"||ticket.region!=="cn"||ticket.proof.kind!=="session")throw new ApiError(403,"image_relay_unavailable","备用上传仅供本人的国内网页原图使用。");
 await db.transaction(tx=>assertImageTicket(tx as never,ticket));
 const bytes=await readRelayImage(request,ticket.size);
 if(imageMime(bytes)!==ticket.mimeType||createHash("sha256").update(bytes).digest("hex")!==ticket.sha256)throw new ApiError(400,"image_mismatch","照片内容与上传凭据不一致，请重新选择原图。");
 await db.transaction(tx=>assertImageTicket(tx as never,ticket));
 if(request.signal.aborted)throw new ApiError(408,"image_interrupted","照片传输已中断，请重试。");
 const storage=dependencies.storage??imageStorage({storageProvider:ticket.provider,storageLocation:ticket.location});
 await storage.write(ticket.pathname,bytes,ticket.mimeType);
 return {uploaded:true};
}
const diagnostic=z.object({traceId:z.string().uuid(),phase:z.enum(["read","prepare","sign","upload","relay","complete","ready","error"]),elapsedMs:z.number().int().min(0).max(600000),loaded:z.number().int().min(0).max(MAX_IMAGE_BYTES+65536).optional(),total:z.number().int().min(0).max(MAX_IMAGE_BYTES+65536).optional(),status:z.number().int().min(0).max(599).optional(),errorKind:z.enum(["network","stalled","timeout","http","read","abort","other"]).optional(),requestId:z.string().regex(/^[A-Za-z0-9+/_=-]{1,160}$/).optional()}).strict();
export function recordImageUploadDiagnostic(input:unknown){const result=diagnostic.safeParse(input);if(!result.success)throw new ApiError(400,"image_diagnostic","上传诊断格式无效。");console.info(JSON.stringify({event:"meal_image_browser",...result.data}));}
