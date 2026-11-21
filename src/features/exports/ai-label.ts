import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import JSZip from "jszip";
import type { Database } from "../../db/client";
import { energyEvent, mealEvent, measurementEvent } from "../../db/schema";

export type ExportAIRecords = { meals: string[]; foods: string[]; measurements: string[]; energy: string[] };
export const exportAILabel = "AI生成或整理（已确认）";

/** 只取本账号、已存在记录的来源标记，不导出审计正文、身份或凭据。 */
export async function readExportAIRecords(db: Pick<Database, "select" | "selectDistinct">, userId: string, ids: ExportAIRecords): Promise<ExportAIRecords> {
  const mealIds = [...ids.meals, ...ids.foods];
  const meals = mealIds.length ? await db.selectDistinct({ id: mealEvent.recordId, type: mealEvent.recordType }).from(mealEvent).where(and(eq(mealEvent.userId, userId), eq(mealEvent.actorType, "ai"), inArray(mealEvent.recordId, mealIds))) : [];
  const measurements = ids.measurements.length ? await db.selectDistinct({ id: measurementEvent.measurementId }).from(measurementEvent).where(and(eq(measurementEvent.userId, userId), eq(measurementEvent.actorType, "ai"), inArray(measurementEvent.measurementId, ids.measurements))) : [];
  const energy = ids.energy.length ? await db.selectDistinct({ id: energyEvent.recordId }).from(energyEvent).where(and(eq(energyEvent.userId, userId), eq(energyEvent.actorType, "ai"), inArray(energyEvent.recordId, ids.energy))) : [];
  return { meals: meals.filter(row => row.type === "meal").map(row => row.id), foods: meals.filter(row => row.type === "food").map(row => row.id), measurements: measurements.map(row => row.id), energy: energy.map(row => row.id) };
}

const xmlText = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

/** TC260-PG-20258A 6.1：OOXML 自定义属性 AIGC，值为七要素 JSON。仅处理本服务新生成的工作簿。 */
export async function labelExportWorkbook(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const zip = await JSZip.loadAsync(bytes);
  if (zip.file("docProps/custom.xml")) throw new Error("新导出已含自定义属性，拒绝覆盖既有标识。");
  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  const relationships = await zip.file("_rels/.rels")?.async("string");
  if (!contentTypes?.includes("</Types>") || !relationships?.includes("</Relationships>")) throw new Error("导出文件结构不完整。");
  const id = "formward-export-" + randomUUID();
  const metadata = { Label: "1", ContentProducer: "Formward", ProduceID: id, ReservedCode1: "", ContentPropagator: "Formward", PropagateID: id, ReservedCode2: "" };
  zip.file("docProps/custom.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="AIGC"><vt:lpwstr>' + xmlText(JSON.stringify(metadata)) + '</vt:lpwstr></property></Properties>');
  zip.file("[Content_Types].xml", contentTypes.replace("</Types>", '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>'));
  zip.file("_rels/.rels", relationships.replace("</Relationships>", '<Relationship Id="rIdAIGC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>'));
  return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}
