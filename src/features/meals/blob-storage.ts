import {get,put,del,list} from "@vercel/blob";
import {ApiError} from "../auth/ai-identity";
import type {ImageStorage} from "./image-storage";
export function blobImageStorage(storageLocation:string):ImageStorage {
 const ref={storageProvider:"blob" as const,storageLocation};
    if(ref.storageLocation!=="legacy"&&ref.storageLocation!==(process.env.FORMWARD_BLOB_LOCATION??"legacy"))throw new ApiError(503,"image_location","照片存储位置暂不可用。");
    return {ref,write:async(path,bytes,mime)=>{await put(path,Buffer.from(bytes),{access:"private",contentType:mime,addRandomSuffix:false,allowOverwrite:false});},
      read:async path=>{const result=await get(path,{access:"private",useCache:false,abortSignal:AbortSignal.timeout(30000)});if(!result||result.statusCode!==200)throw new ApiError(404,"not_found","原图暂不可读取。");return result.stream;},
      remove:async path=>{await del(path);},
      list:async prefix=>{const rows:{pathname:string;createdAt:Date}[]=[];let cursor:string|undefined;do{const page=await list({prefix,cursor,limit:1000});rows.push(...page.blobs.map(v=>({pathname:v.pathname,createdAt:v.uploadedAt})));cursor=page.hasMore?page.cursor:undefined;}while(cursor);return rows;}};

}
