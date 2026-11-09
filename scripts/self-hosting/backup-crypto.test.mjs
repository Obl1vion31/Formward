import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,mkdir,stat,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {randomBytes} from "node:crypto";
test("备份密文可完整恢复，篡改、越界及覆盖均拒绝",{skip:process.getuid?.()!==0},async()=>{
 const folder=await mkdtemp(join(tmpdir(),"formward-backup-crypto-")),root=join(folder,"archives"),key=join(folder,"key");
 try{
  await mkdir(root,{mode:0o700});await writeFile(key,randomBytes(32).toString("hex"),{mode:0o600});
  const plain=join(root,"source.dump"),encrypted=join(root,"source.aesgcm"),restored=join(root,"restored.dump"),bytes=randomBytes(100000);
  await writeFile(plain,bytes,{mode:0o600});
  const script=resolve("scripts/self-hosting/backup-crypto.mjs"),env={...process.env,FORMWARD_BACKUP_ROOT:root,FORMWARD_BACKUP_KEY_FILE:key};
  const run=(mode,input,output)=>spawnSync(process.execPath,[script,mode,input,output],{env,encoding:"utf8"});
  assert.equal(run("encrypt",plain,encrypted).status,0);assert.equal((await stat(encrypted)).mode&0o777,0o600);
  assert.equal(run("decrypt",encrypted,restored).status,0);assert.deepEqual(await readFile(restored),bytes);
  assert.notEqual(run("encrypt",plain,encrypted).status,0);assert.deepEqual(await readFile(restored),bytes);
  const corrupt=await readFile(encrypted);corrupt[corrupt.length-1]^=1;const bad=join(root,"bad.aesgcm"),badOutput=join(root,"bad.dump");await writeFile(bad,corrupt);
  assert.notEqual(run("decrypt",bad,badOutput).status,0);await assert.rejects(stat(badOutput),{code:"ENOENT"});
  assert.notEqual(run("decrypt",encrypted,join(folder,"outside.dump")).status,0);await assert.rejects(stat(join(folder,"outside.dump")),{code:"ENOENT"});
  assert.ok(!(await readdir(root)).some(name=>name.startsWith(".crypto-")));
 }finally{assert.ok(folder.startsWith(join(tmpdir(),"formward-backup-crypto-")));await rm(folder,{recursive:true,force:true});}
});
