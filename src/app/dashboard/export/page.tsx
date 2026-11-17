import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import {ExportWorkspace} from "./export-form";
export const metadata = { title: "Formward · 导出 Excel", referrer: "no-referrer" as const };
export default async function ExportPage() {
  const user = await currentPageUser(); if (!user) redirect("/");
  return <ExportWorkspace/>;
}
