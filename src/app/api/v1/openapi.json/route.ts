import { measurementOpenApiForRequest } from "@/features/measurements/ai-openapi";
import { mealPaths, mealSchemas } from "@/features/meals/ai-openapi";
import { recordPaths, recordSchemas } from "@/features/records/ai-openapi";
import { energyPaths, energySchemas } from "@/features/activities/ai-openapi";
export function GET(request: Request) {
  const original = measurementOpenApiForRequest(request), body = original.components.schemas.SaveRecord, meal = mealSchemas.MealSave, food = mealSchemas.FoodDraft;
  const key = { type: "string", pattern: "^[a-zA-Z0-9_-]{1,120}$" };
  const unifiedSchemas = {
    RecordMeasurementItem: { ...body, required: [...body.required, "key"], properties: { ...body.properties, key } },
    RecordMealSave: { ...meal, required: [...meal.required, "key"], properties: { ...meal.properties, key } },
    RecordFoodSave: { ...food, required: [...food.required, "key", "kind"], properties: { ...food.properties, key, kind: { const: "save_food" } } },
  };
  return Response.json({ ...original, info: { ...original.info, title: "Formward 健康记录 API", version: "1.10.0" }, paths: { ...original.paths, ...mealPaths, ...recordPaths, ...energyPaths }, components: { ...original.components, schemas: { ...original.components.schemas, ...mealSchemas, ...recordSchemas, ...energySchemas, ...unifiedSchemas } } }, { headers: { "Cache-Control": "no-store" } });
}
