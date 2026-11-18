import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { AdminLoading } from "@/features/admin/loading";
import { AdminWorkspace } from "@/features/admin/navigation-view";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get("x-formward-web-path") ?? "/admin";
  return <AdminWorkspace>
    <Suspense fallback={<AdminLoading path={path} />}>{children}</Suspense>
  </AdminWorkspace>;
}
