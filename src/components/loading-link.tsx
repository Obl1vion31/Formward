"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { usePageLoading } from "./page-loading-state";

function NavigationStatus() {
  const { pending } = useLinkStatus();
  usePageLoading({ active: pending, label: "正在加载页面…" });
  return null;
}

export function LoadingLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<NavigationStatus /></Link>;
}
