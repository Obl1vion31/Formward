import { ApiError } from "../auth/ai-identity";
import { readBoundedBody } from "../auth/request-body";
export async function readChatJson(request: Request, limit: number) {
  if (!request.body) throw new ApiError(400,"invalid_request","请求不能为空。");
  const body = await readBoundedBody(request.body, limit, () => new ApiError(413,"request_too_large","请求内容过长。"));
  try { return JSON.parse(body.toString("utf8")); } catch { throw new ApiError(400,"invalid_request","请求格式无效。"); }
}
