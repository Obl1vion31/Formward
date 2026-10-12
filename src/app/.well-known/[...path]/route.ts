import { getAuth } from "@/features/auth/server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const path = new URL(request.url).pathname;
  if (!/^\/\.well-known\/(oauth-authorization-server|oauth-protected-resource|openid-configuration)(\/api\/(auth|mcp))?$/.test(path)) return new Response(null, { status: 404 });
  return getAuth().handler(request);
}
