import COS from "cos-nodejs-sdk-v5";
import {createHash} from "node:crypto";
import {createReadStream,createWriteStream} from "node:fs";
import {readFile,lstat,realpath,mkdtemp,rm,link,open} from "node:fs/promises";
import {finished} from "node:stream/promises";
import {basename,dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {parseEnv} from "node:util";

const ROOT="/var/backups/formward-primary";
const PREFIX="database-backups/formward-primary/v1/";
const NAME=/^formward-primary-\d{8}T\d{12}Z\.dump\.aesgcm$/;
export function backupObjectKey(name){
 if(!NAME.test(name))throw Error("需要正式库加密备份文件名。");
 return PREFIX+name;
}
async function digest(path){
 const hash=createHash("sha256");for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest("hex");
}
async function privateRoot(root){
 const canonical=await realpath(root),info=await lstat(root);
 if(canonical!==resolve(root)||!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077))throw Error("备份目录必须为私有真实目录。");
 return canonical;
}
async function inspectBackup(input,root){
 const path=resolve(input),name=basename(path);backupObjectKey(name);
 if(dirname(path)!==root)throw Error("备份路径越界。");
 const info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink()||info.size<36||(info.mode&0o077)||await realpath(path)!==path)throw Error("备份文件必须私有且不可为链接。");
 const file=await open(path,"r"),magic=Buffer.alloc(8);
 try{await file.read(magic,0,8,0);}finally{await file.close();}
 if(magic.toString()!=="FWDBAK01")throw Error("只上传加密备份，拒绝明文。");
 return {path,name,bytes:info.size,sha256:await digest(path)};
}
async function temporary(root,work){
 const folder=await mkdtemp(join(root,".offsite-"));
 try{return await work(join(folder,"download"));}
 finally{if(dirname(folder)!==root||!basename(folder).startsWith(".offsite-"))throw Error("临时路径越界。");await rm(folder,{recursive:true,force:true});}
}
async function receive(store,key,path){
 const output=createWriteStream(path,{flags:"wx",mode:0o600}),done=finished(output);done.catch(()=>{});
 try{await store.get(key,output);await done;}finally{output.destroy();}
}
export async function uploadBackup(input,store,root=ROOT){
 root=await privateRoot(root);const info=await inspectBackup(input,root),key=backupObjectKey(info.name);
 let head=await store.head(key),reused=Boolean(head);
 if(head&&(head.sha256!==info.sha256||head.bytes!==info.bytes))throw Error("同名远端备份不同，拒绝覆盖。");
 if(!head){
  try{await store.put(key,info.path,info.bytes,info.sha256);}
  catch(error){if(error?.statusCode!==409)throw error;reused=true;}
  head=await store.head(key);
 }
 if(!head||head.sha256!==info.sha256||head.bytes!==info.bytes)throw Error("远端备份元数据不一致。");
 await temporary(root,async path=>{await receive(store,key,path);if(await digest(path)!==info.sha256)throw Error("远端回读摘要不一致。");});
 return {provider:"cos",object:key,bytes:info.bytes,sha256:info.sha256,reused,remoteReadVerified:true};
}
export async function downloadBackup(name,output,store,root=ROOT){
 root=await privateRoot(root);const key=backupObjectKey(name),target=resolve(output);
 if(dirname(target)!==root||basename(target)!=="recovered-"+name)throw Error("恢复路径越界或命名无效。");
 // link 的排他语义同时拒绝已有文件和已有符号链接，失败不覆盖原文件。
 const head=await store.head(key);
 if(!head||!/^[a-f0-9]{64}$/.test(head.sha256))throw Error("远端备份摘要无效。");
 await temporary(root,async path=>{await receive(store,key,path);const info=await lstat(path);if(info.size!==head.bytes||await digest(path)!==head.sha256)throw Error("下载摘要不一致。");await link(path,target);});
 return {provider:"cos",object:key,bytes:head.bytes,sha256:head.sha256,downloadVerified:true};
}
export function cosBackupStore(config){
 const names=["FORMWARD_COS_BUCKET","FORMWARD_COS_REGION","FORMWARD_COS_SECRET_ID","FORMWARD_COS_SECRET_KEY"];
 if(names.some(name=>!config[name])||config.FORMWARD_COS_REGION!=="ap-shanghai"||!/^[-a-z0-9]+-\d+$/.test(config.FORMWARD_COS_BUCKET))throw Error("上海私有备份存储配置无效。");
 const cos=new COS({SecretId:config.FORMWARD_COS_SECRET_ID,SecretKey:config.FORMWARD_COS_SECRET_KEY,Protocol:"https:",Timeout:60000});
 const object=key=>{if(!key.startsWith(PREFIX))throw Error("远端路径越界。");backupObjectKey(key.slice(PREFIX.length));return {Bucket:config.FORMWARD_COS_BUCKET,Region:config.FORMWARD_COS_REGION,Key:key};};
 return {
  head:async key=>{try{const result=await cos.headObject(object(key));return {bytes:Number(result.headers["content-length"]),sha256:result.headers["x-cos-meta-sha256"]};}catch(error){if(error.statusCode===404)return null;throw error;}},
  put:async(key,path,bytes,sha256)=>{await cos.putObject({...object(key),Body:createReadStream(path),ContentLength:bytes,ContentType:"application/octet-stream",CacheControl:"private, no-store",ACL:"private",ServerSideEncryption:"AES256","x-cos-meta-sha256":sha256,Headers:{"x-cos-forbid-overwrite":"true"}});},
  get:async(key,output)=>{await cos.getObject({...object(key),Output:output});},
 };
}
async function main(){
 const [mode,input,output,...extra]=process.argv.slice(2);
 if(extra.length||!["upload","download"].includes(mode)||!input||mode==="upload"&&output||mode==="download"&&!output)throw Error("用法：upload 加密文件，或download 备份名 恢复文件。");
 const file="/etc/formward/primary.env",info=await lstat(file);
 if(info.uid!==0||(info.mode&0o077)||info.isSymbolicLink())throw Error("配置权限无效。");
 const config=parseEnv(await readFile(file,"utf8"));
 if(config.FORMWARD_EXPECTED_DATABASE!=="formward_primary"||config.FORMWARD_MAINTENANCE!=="0")throw Error("正式主库尚未开放。");
 const store=cosBackupStore(config);
 console.log(JSON.stringify(mode==="upload"?await uploadBackup(input,store):await downloadBackup(input,output,store)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 const code=typeof error?.code==="string"&&/^[A-Za-z0-9_]{1,64}$/.test(error.code)?error.code:"offsite_backup_failed";
 console.log(JSON.stringify({offsiteSucceeded:false,code,localBackupsRetained:true}));process.exitCode=1;
});
