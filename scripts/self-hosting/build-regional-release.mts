import { spawnSync } from "node:child_process";
import { mkdtemp,mkdir,readFile,writeFile,cp,rm,readdir,readlink,realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve,join,dirname,isAbsolute } from "node:path";
import { build } from "esbuild";
const root=resolve(import.meta.dirname,"../.."),release=process.argv[2];
if(!release||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(release))throw new Error("需要唯一发布标识。");
function run(cmd:string,args:string[],cwd=root,env:NodeJS.ProcessEnv=process.env){const result=spawnSync(cmd,args,{cwd,env,stdio:"pipe"});if(result.status!==0)throw new Error(cmd+"失败："+result.stderr.toString().slice(-2000));return result.stdout.toString().trim();}
if(run("git",["status","--porcelain"]))throw new Error("统一发布只能从干净提交构建。");
const commit=run("git",["rev-parse","HEAD"]),base=join(root,".codex/regional-releases");await mkdir(base,{recursive:true});
const target=join(base,release);await mkdir(target);
const source=await mkdtemp(join(base,"source-"));
try{
 const archive=join(target,"source.tar");run("git",["archive","--format=tar","--output="+archive,commit]);run("tar",["-xf",archive,"-C",source]);
 run(join(dirname(process.execPath),"pnpm"),["install","--offline","--frozen-lockfile","--ignore-scripts"],source,{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:"development",CI:"1"});
 const lock=await readFile(join(source,"pnpm-lock.yaml"));const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",BETTER_AUTH_URL:"https://formward-ten.vercel.app"};
 const buildResult=spawnSync(process.execPath,[join(source,"node_modules/next/dist/bin/next"),"build","--webpack"],{cwd:source,env,encoding:"utf8",maxBuffer:16*1024*1024});
 await writeFile(join(target,"build.log"),buildResult.stdout+"\n"+buildResult.stderr);
 if(buildResult.status!==0)throw new Error("Next构建失败，查看私有日志。");
 const standalone=join(target,"standalone");await mkdir(standalone);
 for(const name of ["server.js","package.json","node_modules",".next"])await cp(join(source,".next/standalone",name),join(standalone,name),{recursive:true,verbatimSymlinks:true});
 await cp(join(source,".next/static"),join(standalone,".next/static"),{recursive:true,verbatimSymlinks:true});await cp(join(source,"public"),join(standalone,"public"),{recursive:true,verbatimSymlinks:true});
 await rm(join(standalone,".next/cache"),{recursive:true,force:true});
 async function assetNames(path:string,prefix=""):Promise<string[]>{const rows=await readdir(path,{withFileTypes:true});return (await Promise.all(rows.map(v=>v.isDirectory()?assetNames(join(path,v.name),prefix+v.name+"/"):Promise.resolve([prefix+v.name])))).flat();}
 await writeFile(join(standalone,"static-files.json"),JSON.stringify(await assetNames(join(standalone,".next/static"))));
 async function checkLinks(folder:string):Promise<void>{
  for(const item of await readdir(folder,{withFileTypes:true})){const path=join(folder,item.name);
   if(item.isSymbolicLink()){const link=await readlink(path);if(isAbsolute(link))throw new Error("产物包含绝对依赖链接。");const destination=await realpath(path);if(!destination.startsWith(standalone+"/"))throw new Error("产物依赖超出发布目录。");}
   else if(item.isDirectory())await checkLinks(path);
  }
 }
 await checkLinks(standalone);

 const output=join(target,"international/.vercel/output"),fn=join(output,"functions/gateway.func");await mkdir(fn,{recursive:true});
 const bundle=await build({metafile:true,entryPoints:[join(source,"scripts/self-hosting/gateway-entry.ts")],outfile:join(fn,"index.mjs"),bundle:true,platform:"node",format:"esm",target:"node24",packages:"bundle",banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'},logLevel:"silent"});
 if(Object.keys(bundle.metafile!.inputs).some(path=>/postgres\/|src\/db\/|auth\/auth\.ts|cos-nodejs-sdk/.test(path)))throw new Error("国际产物意外包含数据库或国内存储实现。");
 await writeFile(join(fn,".vc-config.json"),JSON.stringify({runtime:"nodejs24.x",handler:"index.mjs",launcherType:"Nodejs",shouldAddHelpers:false,maxDuration:120}));
 await writeFile(join(output,"config.json"),JSON.stringify({version:3,routes:[{src:"/(.*)",dest:"gateway"}]}));
 const buildId=(await readFile(join(source,".next/BUILD_ID"),"utf8")).trim();
 // 源码归档没有独立.git，必须从仓库根目录读取指定提交；不能让Git按临时目录前缀过滤结果。
 const migration=run("git",["ls-tree","-r",commit,"--","drizzle"]);
 if(!migration.includes("drizzle/0028_regional_image_storage.sql")||!migration.includes("drizzle/meta/_journal.json"))throw new Error("迁移清单缺失，拒绝生成发布包。");
 const manifest={release,commit,lockSha256:createHash("sha256").update(lock).digest("hex"),migrationSha256:createHash("sha256").update(migration).digest("hex"),buildId,protocol:"formward-regional-v1",schema:"0028_regional_image_storage",createdAt:new Date().toISOString()};
 for(const folder of [standalone,fn]){await writeFile(join(folder,"release-manifest.json"),JSON.stringify(manifest,null,2));await writeFile(join(folder,"SOURCE_COMMIT"),commit+"\n");await writeFile(join(folder,"BUILD_ID"),buildId+"\n");}
 for(const [name,folder]of [["standalone",standalone],["international",join(target,"international")]]){const file=join(target,name+".tar.gz");run("tar",["-czf",file,"-C",folder,"."]);const digest=createHash("sha256").update(await readFile(file)).digest("hex");await writeFile(file+".sha256",digest+"  "+name+".tar.gz\n");}
 await writeFile(join(target,"release-manifest.json"),JSON.stringify(manifest,null,2));console.log(JSON.stringify({release,commit,buildId,path:target}));
}finally{await rm(source,{recursive:true,force:true});}
