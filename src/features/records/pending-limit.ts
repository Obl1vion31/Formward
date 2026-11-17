import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { ApiError } from "../auth/ai-identity";
export const previewBatch = new AsyncLocalStorage<string>();
/** 用户锁内调用；统一预览只占一个槽，子预览不重复计数。 */
export async function assertPendingCapacity(db: Database,userId: string,root=false){
  if(!root&&previewBatch.getStore()===userId)return;
  const result=await db.execute<{total:number}>(sql`SELECT (
    (SELECT count(*) FROM record_operations p WHERE p.user_id=${userId} AND p.status IN ('pending','partially_confirmed') AND p.created_at>now()-interval '24 hours'
      AND (p.measurement_operation_id IS NULL OR EXISTS(SELECT 1 FROM measurement_operations c WHERE c.id=p.measurement_operation_id AND c.expires_at>now()))
      AND (p.meal_operation_id IS NULL OR EXISTS(SELECT 1 FROM meal_operations c WHERE c.id=p.meal_operation_id AND (c.expires_at IS NULL OR c.expires_at>now())))
      AND (p.energy_operation_id IS NULL OR EXISTS(SELECT 1 FROM energy_operations c WHERE c.id=p.energy_operation_id AND (c.expires_at IS NULL OR c.expires_at>now())))) +
    (SELECT count(*) FROM meal_operations p WHERE p.user_id=${userId} AND p.origin='ai' AND p.status='pending' AND (p.expires_at IS NULL OR p.expires_at>now()) AND NOT EXISTS(SELECT 1 FROM record_operations r WHERE r.meal_operation_id=p.id)) +
    (SELECT count(*) FROM measurement_operations p WHERE p.user_id=${userId} AND p.status IN ('pending','partially_confirmed') AND (p.expires_at IS NULL OR p.expires_at>now()) AND NOT EXISTS(SELECT 1 FROM record_operations r WHERE r.measurement_operation_id=p.id)) +
    (SELECT count(*) FROM energy_operations p WHERE p.user_id=${userId} AND p.origin='ai' AND p.status='pending' AND (p.expires_at IS NULL OR p.expires_at>now()) AND NOT EXISTS(SELECT 1 FROM record_operations r WHERE r.energy_operation_id=p.id))
  )::int AS total`);
  const rows=Array.isArray(result)?result:(result as unknown as {rows:{total:number}[]}).rows;
  if(rows[0].total>=100)throw new ApiError(429,"pending_preview_limit","最多保留100个有效待确认任务，请先处理已有预览。已有内容保留。");
}
