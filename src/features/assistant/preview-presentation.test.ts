import test from "node:test";
import assert from "node:assert/strict";
import {redundantSavedPreviews} from "./preview-presentation";
import type {RecordReviewView} from "../records/model";
const view=(id:string,target:string,status="confirmed",createdAt="2026-11-15T01:00:00Z")=>({id,status,createdAt,rows:[{persisted:true,action:{kind:"save_meal"},meal:{meal:{id:target,version:1}}}]} as unknown as RecordReviewView);
test("same saved target uses newest receipt while unrelated meals remain",()=>{
 const hidden=redundantSavedPreviews([view("old","m1"),view("new","m1","confirmed","2026-11-15T02:00:00Z"),view("other","m2")]);
 assert.deepEqual([...hidden],["old"]);
});
test("unknown, pending and mixed targets are never merged based on similar summaries",()=>{
 assert.equal(redundantSavedPreviews([view("one","m1","pending"),view("two","m1","pending")]).size,0);
 const unknown={id:"unknown",status:"confirmed",rows:[{persisted:true,action:{kind:"save_meal"}}]} as unknown as RecordReviewView;
 assert.equal(redundantSavedPreviews([unknown,{...unknown,id:"different"},view("one","m1")]).size,0);
 const multi={...view("multi","m1"),rows:[...view("one","m1").rows,...view("two","m2").rows]};
 assert.equal(redundantSavedPreviews([multi,view("single","m1")]).size,0);
});

test("同一日同一时段的不同实测候选不能合并，更新须有正式记录ID",()=>{
 const body=(id:string,target?:string)=>({id,status:"confirmed",createdAt:"2026-11-15T01:00:00Z",rows:[{persisted:true,action:{kind:"save_record"},body:{input:{recordId:target},preview:{rows:[{after:{date:"2026-11-15",period:"daytime",weightKg:"67"}}]}}}]} as unknown as RecordReviewView);
 assert.equal(redundantSavedPreviews([body("one"),body("two")]).size,0);
 assert.equal(redundantSavedPreviews([body("one","record1"),body("two","record2")]).size,0);
 assert.equal(redundantSavedPreviews([body("one","record1"),body("two","record1")]).size,0,"仅有修改目标、没有保存后版本时不合并");
});

test("同一正式对象的不同保存版本保留各自回执",()=>{const one=view("one","m1"),two=view("two","m1");two.rows[0].meal!.meal!.version=2;assert.equal(redundantSavedPreviews([one,two]).size,0);});
