import { measurementOpenApi } from "@/features/measurements/ai-openapi";
export function GET() { return Response.json(measurementOpenApi, { headers: { "Cache-Control": "no-store" } }); }
