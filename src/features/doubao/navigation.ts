import { ApiError } from "../auth/ai-identity";

/** 仅用于已验证的豆包授权流程，不接收任意 returnTo。 */
export function doubaoNavigation(target: string, origin: string, canonical: string) {
  const url = new URL(target, canonical);
  if (![new URL(canonical).origin, origin].includes(url.origin)) throw new ApiError(400, "invalid_redirect", "授权返回地址无效。");
  const page = url.pathname === "/oauth/login" ? "/doubao/login" : url.pathname === "/oauth/consent" ? "/doubao/consent" : null;
  if (page) return origin + page + url.search;
  if (url.origin === origin && url.pathname === "/doubao/callback") return url.href;
  throw new ApiError(400, "invalid_redirect", "授权返回地址无效。");
}

export function doubaoScopeLabels(scopes: string[]) {
  const labels: string[] = [];
  if (scopes.includes("openid") || scopes.includes("profile")) labels.push("识别你的账号和显示名称");
  for (const [domain, label] of [["measurements", "身体记录"], ["meals", "饮食与食材"], ["energy", "消耗与活动"], ["training", "训练模板与计划"]]) {
    const actions = [scopes.includes(domain + ":read") ? "查询" : "", scopes.includes(domain + ":write") ? "提交预览" : ""].filter(Boolean);
    if (actions.length) labels.push(label + "：" + actions.join("、"));
  }
  if (scopes.includes("offline_access")) labels.push("自动续期连接，最多30天，可随时撤销");
  return labels;
}
