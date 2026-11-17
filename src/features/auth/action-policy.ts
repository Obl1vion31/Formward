import { readFileSync } from "node:fs";
import { join } from "node:path";
let currentActions: Set<string> | null = null;
/** 兼容静态资源可以保留；旧执行代码不得绕过新的feature校验。 */
export function acceptsCurrentAction(request: Request) {
  if (process.env.NODE_ENV !== "production" || request.method !== "POST") return true;
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return true;
  const id = request.headers.get("next-action");
  if (!id || !/^[a-f0-9]{40,64}$/i.test(id)) return false;
  if (!currentActions) {
    try { const value: unknown = JSON.parse(readFileSync(join(process.cwd(), ".next/security-actions.json"), "utf8")); if (!Array.isArray(value) || value.some(item => typeof item !== "string")) return false; currentActions = new Set(value); }
    catch { return false; }
  }
  return currentActions.has(id);
}
