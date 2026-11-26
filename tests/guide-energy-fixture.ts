import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../src/db/client";
import { personalProfile } from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { submitEnergyOperation, decideEnergyOperation } from "../src/features/activities/records";

/** 只供编号指引的本机隔离夹具使用，通过正式业务函数保存虚构的零与仅总数。 */
export async function seedGuideEnergyStates(db: Database, date: string) {
  assert.equal(process.env.FORMWARD_LOCAL_PREVIEW, "1");
  assert.equal(process.env.FORMWARD_CHAT_NATIVE, "1");
  const accounts = [];
  for (const name of ["unknown", "zero", "only-total"]) {
    const email = `guide-energy-${name}@example.test`, password = "formward-energy-fictional";
    const account = await provisionAccount(db, { email, password, name: "消耗状态 · 虚构数据" });
    await db.update(personalProfile).set({ onboardingStep: "complete" }).where(eq(personalProfile.userId, account.id));
    if (name !== "unknown") {
      const op = await submitEnergyOperation(db, { userId: account.id, origin: "manual" }, {
        operationId: randomUUID(), actions: [{ kind: "save_energy_day", date,
          ...(name === "zero" ? { restingKcal: "0", activeKcal: "0" } : { totalKcal: "1234" }) }],
      });
      await decideEnergyOperation(db, account.id, op.id, op.revision, "confirm");
    }
    accounts.push({ name, email, password });
  }
  return accounts;
}
