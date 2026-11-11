import common from "./ai-field-definitions.json";
import { selectFieldDefinitions } from "./ai-field-selection.mjs";
import measurements from "../measurements/ai-field-definitions.json";
import meals from "../meals/ai-field-definitions.json";
import energy from "../activities/ai-field-definitions.json";
import training from "../training/ai-field-definitions.json";

type Definitions = Readonly<Record<string, string>>;
const operation = [common.operation, common.patch];
const scoped = (definitions: Definitions, prefix: string): Definitions => Object.fromEntries(Object.entries(definitions).map(([path, text]) => [prefix + "." + path, text]));
const trainingPreview = [scoped(training.operation, "rows.*.training"), scoped(training.values, "rows.*.training")];
const mixed = [scoped(measurements.operation, "rows.*.body"), scoped(meals.operation, "rows.*.meal"), scoped(energy.operation, "rows.*.energy"), ...trainingPreview];
export const aiToolDefinitions = {
  authorize_formward: [common.authorize],
  get_profile: [common.profile],
  query_measurements: [common.query, measurements.query],
  submit_measurement_operation: [...operation, measurements.operation],
  get_measurement_operation: [...operation, measurements.operation],
  search_foods: [meals.foods],
  import_meal_images: [meals.images],
  search_exercises: [training.catalog],
  query_training: [common.query, training.query, training.values],
  submit_training_operation: [...operation, ...trainingPreview],
  get_training_operation: [...operation, ...trainingPreview],
  query_energy: [common.query, energy.query],
  query_meals: [common.query, meals.query],
  preview_meal: [...operation, meals.operation],
  preview_energy: [...operation, energy.operation],
  preview_meal_changes: [...operation, meals.operation],
  submit_meal_operation: [...operation, meals.operation],
  get_meal_operation: [...operation, meals.operation],
  submit_record_operation: [...operation, ...mixed],
  get_record_operation: [...operation, ...mixed],
  append_pending_images: [...operation, meals.operation],
} satisfies Record<string, readonly Definitions[]>;

export type AiToolName = keyof typeof aiToolDefinitions;
export const aiToolNames = Object.keys(aiToolDefinitions) as AiToolName[];
export const aiInterpretationRules = common.guidance.join("\n");
export const aiFieldDefinitionsDescription = common.hint;

/** 只扩展成功响应文档，不改变请求Schema、原返回字段或错误响应。 */
export function withAiFieldDefinitionsOpenApi<T>(document: T): T {
  const copy = structuredClone(document) as T & { paths: Record<string, Record<string, unknown>> };
  for (const path of Object.values(copy.paths)) for (const method of ["get", "post"]) {
    const operation = path[method] as { responses?: Record<string, { description?: string; content?: Record<string, { schema?: unknown }> }> } | undefined;
    const success = operation?.responses?.["200"];
    if (!success) continue;
    const prior = success.content?.["application/json"]?.schema;
    const fields = { type: "object", properties: { fieldDefinitions: { type: "object", additionalProperties: { type: "string" }, description: aiFieldDefinitionsDescription } } };
    success.content = { ...success.content, "application/json": { schema: prior ? { allOf: [prior, fields] } : fields } };
    success.description = (success.description ?? "") + " " + aiFieldDefinitionsDescription;
  }
  return copy;
}
export function definitionsFor(tool: AiToolName): Record<string, string> {
  return Object.assign({}, ...aiToolDefinitions[tool]);
}

/** 在AI出口加说明，不修改业务值、不回写草稿或请求摘要。 */
export function withAiFieldDefinitions<T extends Record<string, unknown>>(tool: AiToolName, data: T): T & { fieldDefinitions: Record<string, string> } {
  const definitions = selectFieldDefinitions(data, definitionsFor(tool));
  return { ...data, fieldDefinitions: definitions };
}

export function aiFieldHint(tool: AiToolName): string {
  const definitions = definitionsFor(tool);
  const important = tool === "query_measurements"
    ? [definitions["sevenDay.weightKg.change"], definitions["sevenDay.weightKg.coverage"]].join(" ")
    : "";
  return " " + common.hint + (important ? " " + important : "");
}

export function aiToolForHttp(request: Request): AiToolName | null {
  const path = new URL(request.url).pathname.replace(/\/$/, ""), read = request.method === "GET";
  const queries: Record<string, AiToolName> = {
    "/api/v1/measurements": "query_measurements", "/api/v1/meals": "query_meals",
    "/api/v1/foods": "search_foods", "/api/v1/energy": "query_energy",
  };
  if (read && queries[path]) return queries[path];
  for (const [segment, submit, get] of [
    ["measurement-operations", "submit_measurement_operation", "get_measurement_operation"],
    ["meal-operations", "submit_meal_operation", "get_meal_operation"],
    ["record-operations", "submit_record_operation", "get_record_operation"],
  ] as const) {
    if (!read && request.method === "POST" && path === "/api/v1/" + segment) return submit;
    if (read && new RegExp("^/api/v1/" + segment + "/[^/]+$").test(path)) return get;
  }
  if (request.method === "POST" && path === "/api/v1/meal-images") return "import_meal_images";
  if (request.method === "POST" && path === "/api/v1/pending-images") return "append_pending_images";
  return null;
}
