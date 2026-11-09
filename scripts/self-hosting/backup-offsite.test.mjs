import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtemp,writeFile,readFile,chmod,symlink,rm,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {uploadBackup,downloadBackup,backupObjectKey,cosBackupStore} from "./backup-offsite.mjs";
const name="formward-primary-20261109T120000123456Z.dump.aesgcm";
async function fixture(work){
 const root=await mkdtemp(join(tmpdir(),"formward-offsite-test-"));await chmod(root,0o700);
 try{const file=join(root,name),bytes=Buffer.concat([Buffer.from("FWDBAK01"),Buffer.alloc(80,7)]);await writeFile(file,bytes,{mode:0o600});const objects=new Map();let puts=0;
 const store={head:async key=>objects.get(key)?.head??null,put:async(key,path,size,sha256)=>{puts++;assert.equal(objects.has(key),false);objects.set(key,{body:await readFile(path),head:{bytes:size,sha256}});},get:async(key,output)=>{output.end(objects.get(key).body);}};
 await work({root,file,bytes,store,objects,puts:()=>puts});
 }finally{assert.ok(root.startsWith(join(tmpdir(),"formward-offsite-test-")));await rm(root,{recursive:true,force:true});}
}
test("新备份上传后完整回读，重试复用同一对象不覆盖",()=>fixture(async f=>{
 const first=await uploadBackup(f.file,f.store,f.root);assert.equal(first.remoteReadVerified,true);assert.equal(first.reused,false);
 const next=await uploadBackup(f.file,f.store,f.root);assert.equal(next.reused,true);assert.equal(f.puts(),1);assert.deepEqual(await readFile(f.file),f.bytes);assert.deepEqual(await readdir(f.root),[name]);
}));
test("同名远端内容变化时拒绝覆盖",()=>fixture(async f=>{
 await uploadBackup(f.file,f.store,f.root);f.objects.get(backupObjectKey(name)).head.sha256="0".repeat(64);
 await assert.rejects(uploadBackup(f.file,f.store,f.root),/拒绝覆盖/);assert.equal(f.puts(),1);
}));
test("回读损坏不会误报成功，临时文件清理且本地备份保留",()=>fixture(async f=>{
 f.store.get=async(_key,output)=>{output.end(Buffer.from("fictional corruption"));};
 await assert.rejects(uploadBackup(f.file,f.store,f.root),/回读摘要/);assert.deepEqual(await readFile(f.file),f.bytes);assert.deepEqual(await readdir(f.root),[name]);
}));
test("网络失败保留原备份，下一次可重新验证",()=>fixture(async f=>{
 const get=f.store.get;f.store.get=async()=>{throw Object.assign(Error("fictional offline"),{code:"ETIMEDOUT"});};
 await assert.rejects(uploadBackup(f.file,f.store,f.root),/offline/);assert.deepEqual(await readFile(f.file),f.bytes);
 f.store.get=get;assert.equal((await uploadBackup(f.file,f.store,f.root)).reused,true);assert.equal(f.puts(),1);
}));
test("明文、宽松权限、符号链接与目录穿越均不能上传",()=>fixture(async f=>{
 assert.throws(()=>backupObjectKey("../"+name));assert.throws(()=>backupObjectKey("primary.env"));
 await writeFile(f.file,Buffer.alloc(80));await assert.rejects(uploadBackup(f.file,f.store,f.root),/只上传加密/);
 await writeFile(f.file,f.bytes);await chmod(f.file,0o644);await assert.rejects(uploadBackup(f.file,f.store,f.root),/私有/);await chmod(f.file,0o600);
 const link=join(f.root,"formward-primary-20261109T120001123456Z.dump.aesgcm");await symlink(f.file,link);await assert.rejects(uploadBackup(link,f.store,f.root),/链接/);
 assert.equal(f.puts(),0);
}));
test("恢复下载校验摘要，拒绝覆盖已有文件及越界路径",()=>fixture(async f=>{
 await uploadBackup(f.file,f.store,f.root);const output=join(f.root,"recovered-"+name);
 assert.equal((await downloadBackup(name,output,f.store,f.root)).downloadVerified,true);assert.deepEqual(await readFile(output),f.bytes);
 await assert.rejects(downloadBackup(name,output,f.store,f.root),{code:"EEXIST"});await assert.rejects(downloadBackup(name,join(f.root,"..","recovered-"+name),f.store,f.root),/越界/);
}));
test("恢复下载发现摘要不一致，不留下可被误用的恢复文件",()=>fixture(async f=>{
 await uploadBackup(f.file,f.store,f.root);f.objects.get(backupObjectKey(name)).head.sha256=createHash("sha256").update("fictional other backup").digest("hex");
 await assert.rejects(downloadBackup(name,join(f.root,"recovered-"+name),f.store,f.root),/下载摘要/);assert.deepEqual(await readdir(f.root),[name]);
}));
test("存储只接受显式上海配置，不能从参数选择其他账号或地区",()=>{
 assert.throws(()=>cosBackupStore({}),/配置无效/);assert.throws(()=>cosBackupStore({FORMWARD_COS_BUCKET:"fixture-123456789",FORMWARD_COS_REGION:"eu-frankfurt",FORMWARD_COS_SECRET_ID:"fictional",FORMWARD_COS_SECRET_KEY:"fictional"}),/配置无效/);
});
