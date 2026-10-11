import { measurementOpenApiForRequest } from "@/features/measurements/ai-openapi";
export function GET(request: Request) { return Response.json(measurementOpenApiForRequest(request), { headers: { "Cache-Control": "no-store" } }); }
