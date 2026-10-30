import COS from "cos-nodejs-sdk-v5";
import {blobImageStorage} from "./blob-storage";
import { createHash, createHmac } from "node:crypto";
import { ApiError } from "../auth/ai-identity";

export type StorageRef = { storageProvider:"blob"|"cos"; storageLocation:string; pathname:string };
export type ImageStorage = {
  ref: Pick<StorageRef,"storageProvider"|"storageLocation">;
  write(path:string,bytes:Uint8Array,mime:string):Promise<void>;
  read(path:string):Promise<ReadableStream<Uint8Array>>;
  remove(path:string):Promise<void>;
  list(prefix:string):Promise<{pathname:string;createdAt:Date}[]>;
};
function cosConfig(){
  const Bucket=process.env.FORMWARD_COS_BUCKET,Region=process.env.FORMWARD_COS_REGION,SecretId=process.env.FORMWARD_COS_SECRET_ID,SecretKey=process.env.FORMWARD_COS_SECRET_KEY;
  if(!Bucket||Region!=="ap-shanghai"||!SecretId||!SecretKey)throw new ApiError(503,"image_configuration","国内照片存储尚未配置。");
  return {Bucket,Region,SecretId,SecretKey};
}
export function activeImageStorage(region:"cn"|"global"):ImageStorage {
  return imageStorage(region==="cn"?{storageProvider:"cos",storageLocation:cosLocation()}:{storageProvider:"blob",storageLocation:process.env.FORMWARD_BLOB_LOCATION??"legacy"});
}
export function cosLocation(){const {Bucket,Region}=cosConfig();return Bucket+"@"+Region;}
export function imageStorage(ref:Pick<StorageRef,"storageProvider"|"storageLocation">):ImageStorage {
  if(ref.storageProvider==="blob")return blobImageStorage(ref.storageLocation);
  const config=cosConfig();if(ref.storageLocation!==config.Bucket+"@"+config.Region)throw new ApiError(503,"image_location","照片存储位置暂不可用。");
  const cos=new COS({SecretId:config.SecretId,SecretKey:config.SecretKey,Timeout:30000});
  return {ref,write:async(path,bytes,mime)=>{await cos.putObject({Bucket:config.Bucket,Region:config.Region,Key:path,Body:Buffer.from(bytes),ContentType:mime});},
    read:async path=>{const url=cos.getObjectUrl({Bucket:config.Bucket,Region:config.Region,Key:path,Sign:true,Expires:60});const result=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(30000),redirect:"error"});if(!result.ok||!result.body)throw new ApiError(503,"image_unavailable","原图暂不可读取。");return result.body;},
    remove:async path=>{await cos.deleteObject({Bucket:config.Bucket,Region:config.Region,Key:path});},
    list:async prefix=>{const rows:{pathname:string;createdAt:Date}[]=[];let Marker:string|undefined;for(;;){const page=await cos.getBucket({Bucket:config.Bucket,Region:config.Region,Prefix:prefix,Marker,MaxKeys:1000});rows.push(...page.Contents.map(v=>({pathname:v.Key,createdAt:new Date(v.LastModified)})));if(page.IsTruncated!=="true")break;Marker=page.NextMarker;}return rows;}};
}
export function cosPostPolicy(pathname:string,size:number,mimeType:string,expiresAt:number,now=Date.now()){
  const {Bucket,Region,SecretId,SecretKey}=cosConfig(),time=Math.floor(now/1000)-30+";"+Math.floor(expiresAt/1000);
  const fields:Record<string,string>={key:pathname,"Content-Type":mimeType,"q-sign-algorithm":"sha1","q-ak":SecretId,"q-sign-time":time,success_action_status:"204"};
  const policy=JSON.stringify({expiration:new Date(expiresAt).toISOString(),conditions:[{bucket:Bucket},...Object.entries(fields).map(([key,value])=>({[key]:value})),["content-length-range",size,size]]});
  const signKey=createHmac("sha1",SecretKey).update(time).digest("hex");
  return {url:"https://"+Bucket+".cos."+Region+".myqcloud.com/",fields:{...fields,policy:Buffer.from(policy).toString("base64"),"q-signature":createHmac("sha1",signKey).update(createHash("sha1").update(policy).digest("hex")).digest("hex")}};
}
