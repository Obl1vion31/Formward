export type PreferenceStore = Pick<Storage, "getItem" | "setItem">;
export const assistantSeenKey = (accountId: string, date: string) => `formward:assistant:shown:${accountId}:${date}`;
export const assistantAutoKey = (accountId: string) => `formward:assistant:auto:${accountId}`;
export function assistantAutoEnabled(store: PreferenceStore | null, accountId: string) {
  try { return store?.getItem(assistantAutoKey(accountId)) !== "off"; } catch { return true; }
}
export function assistantAlreadyShown(store: PreferenceStore | null, accountId: string, date: string) {
  try { return store?.getItem(assistantSeenKey(accountId, date)) === "shown" || store?.getItem(`formward:reminders:${accountId}:${date}`) === "closed"; } catch { return false; }
}
export function markAssistantShown(store: PreferenceStore | null, accountId: string, date: string) {
  try { store?.setItem(assistantSeenKey(accountId, date), "shown"); } catch { /* 存储不可用仍可使用本页。 */ }
}
