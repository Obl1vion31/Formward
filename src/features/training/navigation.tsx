import { LoadingLink } from "@/components/loading-link";
import styles from "./training.module.css";
export function TrainingTabs({ active }: { active: "training" | "energy" }) {
  return <nav className={styles.tabs} aria-label="训练与消耗"><LoadingLink href="/dashboard/training" aria-current={active === "training" ? "page" : undefined}>训练</LoadingLink><LoadingLink href="/dashboard/energy" aria-current={active === "energy" ? "page" : undefined}>消耗</LoadingLink></nav>;
}
