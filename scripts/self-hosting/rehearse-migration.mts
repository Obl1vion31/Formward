import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { createDatabase } from "../../src/db/client";
import { migrate } from "drizzle-orm/postgres-js/migrator";
const [file,command]=process.argv.slice(2);
if(!file||!["check","migrate","backup"].includes(command))throw new Error("用法：rehearse-migration.mts 独立环境文件 check|migrate|backup");
const env=parseEnv(await readFile(file,"utf8")),url=env.REHEARSAL_DATABASE_URL;
if(!url)throw new Error("必须显式配置REHEARSAL_DATABASE_URL。");
const parsed=new URL(url);
if(!["localhost","127.0.0.1","[::1]"].includes(parsed.hostname)||!/^formward_(regional_test|rehearsal)_[a-zA-Z0-9_]+$/.test(parsed.pathname.slice(1)))throw new Error("仅允许回环地址的独立演练库。");
const database=createDatabase(url);
try{
 if(command==="migrate")await migrate(database.db,{migrationsFolder:"./drizzle"});
 else if(command==="check"){const result=await database.db.$client`select current_database() as name, current_setting('server_version') as version`;console.log(JSON.stringify({database:result[0].name,version:result[0].version}));}
 else {
  if(!env.REHEARSAL_ARCHIVE)throw new Error("备份需显式REHEARSAL_ARCHIVE目标。");
  const result=spawnSync("pg_dump",["--format=custom","--no-owner","--no-acl","--file",env.REHEARSAL_ARCHIVE],{env:{NODE_ENV:"test",PATH:process.env.PATH,PGHOST:parsed.hostname,PGPORT:parsed.port||"5432",PGDATABASE:decodeURIComponent(parsed.pathname.slice(1)),PGUSER:decodeURIComponent(parsed.username),PGPASSWORD:decodeURIComponent(parsed.password)},encoding:"utf8"});
  if(result.status!==0)throw new Error("演练备份失败。");
 }
}finally{await database.close();}
