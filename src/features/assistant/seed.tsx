"use client";
import { useEffect } from "react";
import { useAssistant } from "./context";
import type { AssistantContext } from "./model";
export function AssistantSeed({ data }: { data: AssistantContext }) {
  const { seed } = useAssistant();
  useEffect(() => { seed(data); }, [data, seed]);
  return null;
}
