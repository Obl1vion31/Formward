import { createHmac,timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError,type AiIdentity } from "../auth/ai-identity";
import type { SessionProof } from "../auth/account-security";
export const imageFileSchema=z.object({fileName:z.string().max(255),size:z.number().int().positive().max(20971520),mimeType:z.enum(["image/jpeg","image/png","image/webp"]),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const proofSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("session"),sessionId:z.string(),accessVersion:z.number().int()}),
 z.object({kind:z.literal("ai"),tokenId:z.string().optional(),oauthConnectionId:z.string().optional(),accessVersion:z.number().int()}),
 z.object({kind:z.literal("maintenance"),accessVersion:z.number().int()})
]);
export const imageTicketSchema=imageFileSchema.extend({v:z.literal(2),id:z.string().uuid(),userId:z.string().min(1),pathname:z.string(),expiresAt:z.number(),provider:z.enum(["blob","cos"]),location:z.string(),region:z.enum(["cn","global"]),proof:proofSchema,downloadUrl:z.string().optional(),sourceFileId:z.string().optional()}).strict();
export type ImageTicket=z.infer<typeof imageTicketSchema>;
function key(secret=process.env.FORMWARD_IMAGE_SECRET??process.env.BETTER_AUTH_SECRET){if(!secret)throw new ApiError(503,"image_configuration","照片上传尚未配置。");return createHmac("sha256",secret).update("formward-image-v2").digest();}
export function signImageTicket(payload:ImageTicket,secret?:string){const data=Buffer.from(JSON.stringify(imageTicketSchema.parse(payload))).toString("base64url");return data+"."+createHmac("sha256",key(secret)).update(data).digest("base64url");}
export function verifyImageUploadTicket(raw:string,userId?:string,secret?:string,now=Date.now()){
 const [encoded,signature,extra]=raw.split(".");if(!encoded||!signature||extra)throw new ApiError(400,"image_ticket","上传凭据无效，请刷新后重试。");
 const expected=createHmac("sha256",key(secret)).update(encoded).digest(),actual=Buffer.from(signature,"base64url");
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new ApiError(400,"image_ticket","上传凭据无效。");
 let parsed:ReturnType<typeof imageTicketSchema.safeParse>;try{parsed=imageTicketSchema.safeParse(JSON.parse(Buffer.from(encoded,"base64url").toString()));}catch{throw new ApiError(400,"image_ticket","上传凭据无效。");}
 if(!parsed.success)throw new ApiError(400,"image_ticket","旧上传凭据已停用，请重新上传；已保存照片不受影响。");
 const ticket=parsed.data;
 if((userId&&ticket.userId!==userId)||ticket.pathname!=="meal-tmp-v2/"+ticket.userId+"/"+ticket.id)throw new ApiError(403,"image_owner","上传凭据不属于当前账号。");
 if(ticket.expiresAt<=now)throw new ApiError(409,"image_ticket_expired","上传凭据已过期，请重新上传。");
 return ticket;
}
export function ticketIdentity(ticket:ImageTicket):AiIdentity|null {
 if(ticket.proof.kind!=="ai")return null;
 return ticket.proof.tokenId?{userId:ticket.userId,permission:"write",tokenId:ticket.proof.tokenId}:{userId:ticket.userId,permission:"write",oauthConnectionId:ticket.proof.oauthConnectionId!};
}
export function ticketSession(ticket:ImageTicket):SessionProof|null{return ticket.proof.kind==="session"?{userId:ticket.userId,sessionId:ticket.proof.sessionId,accessVersion:ticket.proof.accessVersion}:null;}
