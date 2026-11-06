"use client";
import { createContext, useContext } from "react";
import type { AssistantContext as ContextData } from "./model";

export type AssistantState = { open: boolean; count: number; show: () => void; hide: () => Promise<void>; seed: (data: ContextData) => void };
export const AssistantStateContext = createContext<AssistantState>({ open: false, count: 0, show() {}, async hide() {}, seed() {} });
export const useAssistant = () => useContext(AssistantStateContext);
