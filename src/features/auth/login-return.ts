const localBase = "https://formward.invalid";

/** 登录目标只接受本站业务路径；外部地址、协议相对地址和反斜线均回总览。 */
export function loginDestination(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  try {
    const target = new URL(value, localBase);
    if (target.origin !== localBase || !["/dashboard", "/admin", "/onboarding"].some(root => target.pathname === root || target.pathname.startsWith(root + "/"))) return "/dashboard";
    return target.pathname + target.search + target.hash;
  } catch { return "/dashboard"; }
}

export function loginPageUrl(path: string | null | undefined): string {
  const target = loginDestination(path);
  return target === "/dashboard" ? "/" : "/?next=" + encodeURIComponent(target);
}
