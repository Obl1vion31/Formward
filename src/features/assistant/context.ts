"use client";
import { createContext, useContext } from "react";
export type AssistantState = { open: boolean; count: number; show: () => void; toggle: () => void; hide: () => Promise<void> };
export const AssistantStateContext = createContext<AssistantState>({ open: false, count: 0, show() {}, toggle() {}, async hide() {}, });
export const useAssistant = () => useContext(AssistantStateContext);