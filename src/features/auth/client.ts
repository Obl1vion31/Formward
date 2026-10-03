"use client";

type LoginResult = { success: true } | { success: false; message: string };

export async function signIn(email: string, password: string, signal: AbortSignal): Promise<LoginResult> {
  try {
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (response.ok) return { success: true };
    const message = response.status === 401 ? "邮箱或密码不正确，请重新输入。"
      : response.status === 400 ? "请检查邮箱和密码后重试。"
        : response.status === 429 ? "尝试次数较多，请稍等一分钟后重试。"
          : "登录服务暂时不可用，请稍后重试。";
    return { success: false, message };
  } catch {
    return { success: false, message: "连接失败，请检查网络后重试。" };
  }
}

export async function signOut() {
  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: "{}",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("退出失败，请重试。");
}
