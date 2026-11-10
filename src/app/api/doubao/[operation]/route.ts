import { getDatabase } from "@/db/client";
import { getAuth } from "@/features/auth/server";
import { doubaoConfig } from "@/features/doubao/config";
import { privateJson } from "@/features/doubao/http";
import { handleDoubaoRequest } from "@/features/doubao/routes";

export const runtime = "nodejs";
export const maxDuration = 120;

async function handle(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    const config = doubaoConfig();
    return await handleDoubaoRequest(getDatabase(), getAuth(), config, (await context.params).operation, request);
  } catch {
    return privateJson({ code: 503, msg: "豆包接入尚未启用或配置未完成。" }, 503);
  }
}

export { handle as GET, handle as POST };
