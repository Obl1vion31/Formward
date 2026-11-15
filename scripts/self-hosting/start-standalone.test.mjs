import assert from "node:assert/strict";
import {test} from "node:test";
import http from "node:http";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
const launcher=fileURLToPath(new URL("./start-standalone.mjs",import.meta.url));
async function port(){const server=http.createServer();server.listen(0,"127.0.0.1");await once(server,"listening");const value=server.address().port;await new Promise(done=>server.close(done));return value;}
async function fixture(t,enabled=true){
 const folder=await mkdtemp(join(tmpdir(),"formward-upload-listener-")),primary=await port(),upload=await port(),target=join(folder,"server.mjs");
 await writeFile(target,`import http from "node:http";const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);res.setHeader("Content-Type","application/json");res.end(JSON.stringify({handler:"same-app",requestTimeout:req.socket.server.requestTimeout,headersTimeout:req.socket.server.headersTimeout,url:req.url,bytes:Buffer.concat(chunks).length}));});server.listen(Number(process.env.PORT),"127.0.0.1");process.on("SIGTERM",()=>{server.closeAllConnections();server.close();});`);
 const env={...process.env,PORT:String(primary)};if(enabled)env.FORMWARD_UPLOAD_PORT=String(upload);else delete env.FORMWARD_UPLOAD_PORT;
 const child=spawn(process.execPath,[launcher,target],{env,stdio:["ignore","pipe","pipe"]});let log="";child.stderr.on("data",b=>log+=b);child.stdout.on("data",b=>log+=b);
 t.after(async()=>{if(child.exitCode===null){const exited=once(child,"exit");child.kill("SIGTERM");await exited;}assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep));assert.ok(folder.includes("formward-upload-listener-"));await rm(folder,{recursive:true,force:true});});
 for(let i=0;i<100;i++){assert.equal(child.exitCode,null,log);try{const r=await fetch(`http://127.0.0.1:${enabled?upload:primary}/api/meal-images/upload`);if(r.ok)return{primary,upload,child};}catch{}await new Promise(done=>setTimeout(done,25));}
 throw Error("隔离监听未就绪："+log);
}
test("上传复用原处理器并独立使用660秒，普通请求保持Node原期限",async t=>{
 const f=await fixture(t),primary=await(await fetch(`http://127.0.0.1:${f.primary}/health`)).json(),upload=await(await fetch(`http://127.0.0.1:${f.upload}/api/meal-images/upload?step=probe`,{method:"POST",body:Buffer.alloc(131072,7)})).json();
 assert.equal(primary.handler,"same-app");assert.equal(primary.requestTimeout,300000);assert.equal(upload.handler,"same-app");assert.equal(upload.requestTimeout,660000);assert.equal(upload.headersTimeout,60000);assert.equal(upload.url,"/api/meal-images/upload?step=probe");assert.equal(upload.bytes,131072);
});
test("私有上传监听不开放其他路径或方法",async t=>{const f=await fixture(t);assert.equal((await fetch(`http://127.0.0.1:${f.upload}/api/mcp`)).status,404);assert.equal((await fetch(`http://127.0.0.1:${f.upload}/api/meal-images/upload`,{method:"DELETE"})).status,405);});
test("未配置上传端口时继续使用原standalone入口",async t=>{const f=await fixture(t,false);assert.equal((await(await fetch(`http://127.0.0.1:${f.primary}/health`)).json()).requestTimeout,300000);});
test("拒绝将上传监听与普通端口配置为同一个端口",async()=>{const child=spawn(process.execPath,[launcher,"unused-server.js"],{env:{...process.env,PORT:"3200",FORMWARD_UPLOAD_PORT:"3200"},stdio:["ignore","pipe","pipe"]});let log="";child.stderr.on("data",b=>log+=b);const[code]=await once(child,"exit");assert.equal(code,1);assert.match(log,/独立的有效回环端口/);});
