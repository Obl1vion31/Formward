"use server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { getDatabase } from "@/db/client";
import { account, session } from "@/db/schema";
import { currentSessionIdentity, accountRequestSource } from "@/features/auth/request-identity";
import { getAuth } from "@/features/auth/auth";
import { requireSessionProof, limitAccountAttempt, ownerMfaRequired, ownerMfaPaused } from "@/features/auth/account-security";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { ApiError } from "@/features/auth/ai-identity";
import { safeAiError } from "@/features/measurements/ai-api";

export async function loadSecurityAction() {
  try {
    const { proof } = await currentSessionIdentity(await headers(), { allowMfaSetup: true });
    const value = await requireSessionProof(getDatabase(), proof, false, { allowMfaSetup: true });
    return { ok: true as const, data: { email: value.user.email, enabled: value.user.twoFactorEnabled, required: value.user.role === "owner" && ownerMfaRequired(), enrollmentPaused: value.user.role === "owner" && ownerMfaPaused(), recovery: value.session.mfaRecoveryRequired, verifiedAt: value.session.securityVerifiedAt?.toISOString() ?? null } };
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function verifySecurityAction(password: string, code?: string) {
  try {
    const h = await headers();
    if (!isAccountRequestOrigin(h)) throw new ApiError(403, "forbidden", "验证来源无效。");
    const { proof } = await currentSessionIdentity(h);
    const db = getDatabase(), current = await requireSessionProof(db, proof);
    await limitAccountAttempt(db, "security-account", proof.userId);
    await limitAccountAttempt(db, "security-source", accountRequestSource(h));
    const [credential] = await db.select({ password: account.password }).from(account).where(and(eq(account.userId, proof.userId), eq(account.providerId, "credential")));
    if (typeof password !== "string" || password.length > 128 || !credential?.password || !await verifyPassword({ password, hash: credential.password })) throw new ApiError(400, "invalid_password", "密码不正确，请重新输入。");
    if (current.user.twoFactorEnabled) {
      const response = await getAuth().api.verifyTOTP({ headers: h, body: { code: code ?? "", trustDevice: false }, asResponse: true });
      if (!response.ok) throw new ApiError(400, "invalid_code", "动态码无效或已过期，请使用新的动态码。");
    }
    await db.transaction(async tx => {
      await tx.select().from(session).where(eq(session.id, proof.sessionId)).for("update");
      await requireSessionProof(tx, proof);
      await tx.update(session).set({ securityVerifiedAt: new Date(), adminVerifiedAt: current.user.role === "owner" ? new Date() : null }).where(eq(session.id, proof.sessionId));
    });
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
