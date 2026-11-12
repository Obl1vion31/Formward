import { z } from "zod";
import { ApiError } from "../auth/ai-identity";

/** 仅返回校验路径及修正要求，不回显提交内容、凭据或内部异常。 */
export function invalidAiSchema(error: z.ZodError, prefix = ""): never {
  const flatten = (issues: readonly z.core.$ZodIssue[], parent: PropertyKey[] = []): { path: string; message: string }[] => issues.flatMap(issue => {
    const location = [...parent, ...issue.path];
    if (issue.code === "invalid_union") {
      const candidates = issue.errors.map(errors => flatten(errors, location));
      return candidates.sort((a, b) => a.length - b.length)[0] ?? [];
    }
    const path = [prefix, ...location.map(String)].filter(Boolean).join(".") || "参数";
    if (issue.code === "unrecognized_keys") return issue.keys.map(key => ({ path: path + "." + key, message: "此处不接收该字段，请删除；不要把其他工具的参数格式混用。" }));
    return [{ path, message: issue.code === "invalid_type" ? "类型或必填值不正确，请按本工具定义填写；未知值不能猜测。" : issue.message }];
  });
  const fields = flatten(error.issues).slice(0, 12);
  throw new ApiError(400, "invalid_input", fields.map(field => field.path + "：" + field.message).join("；"), { fields, nextAction: "correct_arguments_or_ask_user" });
}
