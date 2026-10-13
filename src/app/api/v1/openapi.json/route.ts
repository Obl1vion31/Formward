import { measurementOpenApiForRequest } from "@/features/measurements/ai-openapi";
import { mealPaths, mealSchemas } from "@/features/meals/ai-openapi";
export function GET(request: Request) { const original = measurementOpenApiForRequest(request); return Response.json({ ...original, info: { ...original.info, title: "Formward 身体与饮食 API", version: "1.4.0" }, paths: { ...original.paths, ...mealPaths }, components: { ...original.components, schemas: { ...original.components.schemas, ...mealSchemas } } }, { headers: { "Cache-Control": "no-store" } }); }
