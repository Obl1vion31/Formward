import { createHmac,timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { blobImageStorage } from "./blob-storage";
const schema=z.object({userId:z.string(),pathname:z.string(),storageProvider:z.literal("blob"),storageLocation:z.string(),mimeType:z.enum(["image/jpeg","image/png","image/webp"]),expiresAt:z.number()}).strict();
function sign(value:string){const secret=process.env.FORMWARD_IMAGE_SECRET;if(!secret||secret.length<32)throw new Error("国际图片读取尚未配置。");return createHmac("sha256",secret).update("image-read-v1\n"+value).digest();}
export function imageReadTicket(image:{userId:string;pathname:string;storageProvider:"blob"|"cos";storageLocation:string;mimeType:string}){
 const value=Buffer.from(JSON.stringify(schema.parse({...image,expiresAt:Date.now()+90000}))).toString("base64url");
 return value+"."+sign(value).toString("base64url");
}
export async function readWorkerImage(raw:string){
 const [value,signature,extra]=raw.split(".");if(extra||!value||!signature)throw new Error("照片读取凭据无效。");
 const expected=sign(value),actual=Buffer.from(signature,"base64url");
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new Error("照片读取凭据无效。");
 const image=schema.parse(JSON.parse(Buffer.from(value,"base64url").toString()));
 if(image.expiresAt<=Date.now()||!["meals/","meal-uploads/","meal-formal-v2/"].some(prefix=>image.pathname.startsWith(prefix+image.userId+"/"))||image.pathname.includes(".."))throw new Error("照片读取凭据失效。");
 return new Response(await blobImageStorage(image.storageLocation).read(image.pathname),{headers:{"Content-Type":image.mimeType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
