import assert from 'node:assert/strict';
import {test,after,before} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import {provisionAccount} from './provision';
import {loadAccountPreferences,saveAccountPreferences} from './preferences';
import {saveImportedMeasurements} from '../measurements/records';
const pg=new PGlite(),db=drizzle(pg,{schema});
before(async()=>{await migrate(db,{migrationsFolder:'./drizzle'});});after(async()=>{await pg.close();});
async function person(){const {id}=await provisionAccount(db,{email:randomUUID()+'@preferences.example.test',password:'fictional-preferences-password'});const sessionId=randomUUID();await db.insert(schema.session).values({id:sessionId,userId:id,token:randomUUID(),expiresAt:new Date(Date.now()+3600000),accessVersion:0});return {userId:id,sessionId,accessVersion:0};}
test('指标偏好显式存储、同值重试幂等与旧版本冲突',async()=>{
 const proof=await person();assert.deepEqual(await loadAccountPreferences(db,proof),{showBodyFat:false,version:0,updatedAt:null});
 const first=await saveAccountPreferences(db,proof,{showBodyFat:false,expectedVersion:0});assert.equal(first.version,1);
 assert.deepEqual(await saveAccountPreferences(db,proof,{showBodyFat:false,expectedVersion:0}),first);
 assert.equal((await saveAccountPreferences(db,proof,{showBodyFat:true,expectedVersion:1})).version,2);
 await assert.rejects(saveAccountPreferences(db,proof,{showBodyFat:false,expectedVersion:1}),/其他设备/);
 await assert.rejects(saveAccountPreferences(db,proof,{showBodyFat:'false',expectedVersion:2}),/格式无效/);
 await assert.rejects(saveAccountPreferences(db,proof,{showBodyFat:false,expectedVersion:2,userId:randomUUID()}),/格式无效/);
});
test('指标偏好按本人会话隔离，体脂默认来自自己的实测且关闭不改历史',async()=>{
 const a=await person(),b=await person();
 await saveImportedMeasurements(db,{userId:a.userId,actorId:a.userId,fileDigest:createHash('sha256').update(randomUUID()).digest('hex'),sourceLabel:'虚构偏好测试',captureChannel:'file',records:[{sourceLocalTime:'2026-11-05 07:25:00',weightKg:'70.18',bodyFatPercent:'20.81',fasting:true,fastingSource:'user_confirmed',timezone:'Asia/Shanghai',sourceRow:2}]});
 assert.equal((await loadAccountPreferences(db,a)).showBodyFat,true);assert.equal((await loadAccountPreferences(db,b)).showBodyFat,false);
 await assert.rejects(loadAccountPreferences(db,{...a,userId:b.userId}),/失效/);
 await assert.rejects(saveAccountPreferences(db,{...a,userId:b.userId},{showBodyFat:true,expectedVersion:0}),/失效/);
 const rows=await db.select().from(schema.measurement);await saveAccountPreferences(db,a,{showBodyFat:false,expectedVersion:0});assert.deepEqual(await db.select().from(schema.measurement),rows);
 const secondSession=randomUUID();await db.insert(schema.session).values({id:secondSession,userId:a.userId,token:randomUUID(),expiresAt:new Date(Date.now()+3600000),accessVersion:0});
 const synced=await loadAccountPreferences(db,{...a,sessionId:secondSession});assert.equal(synced.showBodyFat,false);assert.equal(synced.version,1);
 assert.equal((await loadAccountPreferences(db,b)).version,0);
});
