import { getAuth } from "@/features/auth/server";

export const runtime = "nodejs";

async function handle(request: Request) {
  try {
    return await getAuth().handler(request);
  } catch {
    return Response.json({ message: "登录服务暂时不可用，请稍后重试。" }, { status: 503 });
  }
}

export { handle as GET, handle as POST };
