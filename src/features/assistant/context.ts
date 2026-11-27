"use client";
import { createContext, useContext } from "react";
import type { AssistantContext, AssistantItem } from "./model";
import type { AssistantPageMotion, AssistantPageState } from "./page-navigation";

export type AssistantTasksState = {
  data: AssistantContext | null;
  error: string;
  loading: boolean;
  retry: () => void;
  dismissItem: (id: string, willRemove: () => void) => Promise<string>;
  completeMealDay: (item: AssistantItem, operationId: string, willRemove: () => void) => Promise<string>;
};
type AssistantSource = { path: string; query: string };
type AssistantState = {
  open: boolean;
  count: number;
  toggle: () => void;
  hide: () => Promise<void>;
  openMealTask: (id: string) => void;
  source: AssistantSource | null;
  page: AssistantPageState | null;
  backFromPage: () => void;
  completePageMotion: (motion: AssistantPageMotion) => void;
  tasks: AssistantTasksState | null;
};
export const AssistantStateContext = createContext<AssistantState>({
  open: false, count: 0, toggle() {}, async hide() {}, openMealTask() {}, source: null, page: null, backFromPage() {}, completePageMotion() {}, tasks: null,
});
export const useAssistant = () => useContext(AssistantStateContext);
