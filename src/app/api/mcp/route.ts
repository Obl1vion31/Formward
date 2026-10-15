import { getDatabase } from "@/db/client";
import { getAuth } from "@/features/auth/server";
import { createMcpEndpoint } from "@/features/mcp/server";

export const maxDuration = 120;
export const runtime = "nodejs";
export async function POST(request: Request) {
  return createMcpEndpoint(getDatabase(), getAuth())(request);
}
