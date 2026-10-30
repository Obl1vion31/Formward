import { eq } from "drizzle-orm";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import type { Database } from "../../db/client";
import { oauthClient } from "../../db/schema";
import { z } from "zod";

export const oauthEnvelopeSchema = z.object({
  method:z.enum(["GET","POST"]), path:z.string().max(8192),
  headers:z.record(z.string(),z.string()), body:z.string().max(180000),
  materials:z.array(z.object({url:z.string().max(8192),body:z.string().max(65536),contentType:z.string().max(200)}).strict()).max(3).default([])
}).strict();
export type OAuthEnvelope = z.infer<typeof oauthEnvelopeSchema>;
export function validateOAuthPath(path:string) {
  if (!/^\/(api\/auth\/|\.well-known\/)/.test(path) || path.startsWith("//") || path.includes("#") || path.includes("\\") || new URL(path,"https://fixed.test").origin!=="https://fixed.test") throw new Error("认证路径无效。");
}
export function metadataUrl(value:string) {
  const url=new URL(value);
  if(url.protocol!=="https:"||url.username||url.password||url.hash||!isPublicRoutableHost(url.hostname))throw new Error("客户端资料地址无效。");
  return url.href;
}
function candidate(envelope:OAuthEnvelope) {
  const query=new URL(envelope.path,"https://fixed.test").searchParams;
  let params=query;
  if(envelope.method==="POST") {
    const body=Buffer.from(envelope.body,"base64").toString();
    if(new Headers(envelope.headers).get("content-type")?.includes("application/json")) {const value=JSON.parse(body);params=new URLSearchParams(Object.entries(value).filter((entry):entry is [string,string]=>typeof entry[1]==="string"));}
    else params=new URLSearchParams(body);
  }
  let id=params.get("client_id") ?? query.get("client_id");
  if(!id) {const basic=new Headers(envelope.headers).get("authorization");if(basic?.startsWith("Basic "))id=decodeURIComponent(Buffer.from(basic.slice(6),"base64").toString().split(":")[0]);}
  if(!id&&params.has("client_assertion"))try {const untrusted=JSON.parse(Buffer.from(params.get("client_assertion")!.split(".")[1],"base64url").toString());id=typeof untrusted.iss==="string"?untrusted.iss:null;}catch{}
  return id?.slice(0,8192);
}
export async function oauthPreflight(db:Database,envelope:OAuthEnvelope) {
  validateOAuthPath(envelope.path);
  const id=candidate(envelope), needed:{url:string;maxBytes:number}[]=[];
  if(!id)return needed;
  const [client]=await db.select().from(oauthClient).where(eq(oauthClient.clientId,id));
  if(id.startsWith("https://")) {
    const url=metadataUrl(id);needed.push({url,maxBytes:5120});
    const doc=envelope.materials.find(m=>m.url===url);
    if(doc){if(Buffer.byteLength(doc.body)>5120)throw new Error("客户端资料过大。");const value=JSON.parse(doc.body);if(typeof value.jwks_uri==="string")needed.push({url:metadataUrl(value.jwks_uri),maxBytes:65536});}
  }
  if(client?.jwksUri)needed.push({url:metadataUrl(client.jwksUri),maxBytes:65536});
  return [...new Map(needed.map(v=>[v.url,v])).values()];
}
export async function validateOAuthMaterials(db:Database,envelope:OAuthEnvelope) {
  const needed=await oauthPreflight(db,envelope), map=new Map(needed.map(v=>[v.url,v.maxBytes]));
  if(envelope.materials.length!==needed.length || new Set(envelope.materials.map(v=>v.url)).size!==needed.length ||
    envelope.materials.some(v=>!map.has(v.url)||Buffer.byteLength(v.body)>map.get(v.url)!))throw new Error("认证资料不完整或未授权。");
}
