import { z } from "zod";
import { actionSchema, type MealAction, type MealOperationView, type FoodView, type MealView, type PreviewRow } from "../meals/model";
import type { ReviewInput, ReviewItem } from "../measurements/ai-operations";
import { energyActionSchemas, isEnergy, type EnergyAction, type EnergyPreview, type EnergyOperationView } from "../activities/model";
export { isEnergy } from "../activities/model";

const key = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const decimal = z.string().nullable().optional();
export const recordItemSchema = z.union([
  z.object({ key, kind: z.literal("save_record"), date: z.string(), period: z.enum(["daytime", "evening"]), recordId: z.string().optional(), version: z.string().optional(), weightKg: decimal, bodyFatPercent: decimal, deviceLabel: decimal, fasting: z.boolean().nullable().optional(), timezone: decimal, sourceUnspecifiedConfirmed: z.boolean().optional() }).strict(),
  z.object({ key, kind: z.literal("estimate_cell"), date: z.string(), period: z.enum(["daytime", "evening"]), metric: z.enum(["weightKg", "bodyFatPercent"]) }).strict(),
  ...actionSchema.options.map(schema => schema.extend({ key })),
  ...energyActionSchemas.map(schema => schema.extend({ key })),
]);
export const recordInputSchema = z.object({ operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/), timezone: z.string().optional(), items: z.array(recordItemSchema).min(1).max(100) }).strict();
export type RecordAction = ReviewInput | MealAction | EnergyAction;
export const publicRecordInputSchema = recordInputSchema.extend({ items: z.array(z.union(recordItemSchema.options.filter(schema => !schema.shape.kind.value.includes("energy_defaults") && !schema.shape.kind.value.startsWith("delete_") && !schema.shape.kind.value.startsWith("restore_")))).min(1).max(100) });
export type RecordInput = z.infer<typeof recordInputSchema>;
export type RecordItem = { key: string; action: RecordAction; originalInput: RecordAction; excluded: boolean; checked: boolean; persisted?: boolean; measurementItemId?: string; editedBy?: { userId: string; at: string } };
export const isBody = (action: RecordAction): action is ReviewInput => action.kind === "save_record" || action.kind === "estimate_cell";
export const category = (action: RecordAction) => isBody(action) ? "body" : isEnergy(action) ? "energy" : action.kind.endsWith("food") ? "foods" : "meals";
export type RecordRow = RecordItem & { body?: ReviewItem; meal?: PreviewRow; energy?: EnergyPreview; duplicateMeals?: MealView[] };
export type RecordReviewView = { id: string; revision: number; status: string; rows: RecordRow[]; expiresAt: string | null; confirmationPath: string; createdAt: string; foods: FoodView[]; mealOperation?: MealOperationView; energyOperation?: EnergyOperationView; saved: number; canConfirm: boolean; needsUserInput: { key: string; questions: string[] }[] };
export type RecordReviewAction = { revision: number } & (
  { kind: "check" | "exclude" | "restore"; keys: string[] } |
  { kind: "update"; key: string; action: RecordAction } |
  { kind: "refresh" | "cancel" } | { kind: "confirm"; allowMissingImageKeys?: string[] }
);
