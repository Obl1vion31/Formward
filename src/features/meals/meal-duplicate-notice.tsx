import { LoadingLink } from "@/components/loading-link";
import { duplicateMealNotice } from "./model";
import styles from "./meals.module.css";

export function MealDuplicateNotice({ date }: { date: string }) {
  return <p className={styles.duplicateNotice} role="status"><span>{duplicateMealNotice}</span><LoadingLink href={"/dashboard/meals?date=" + date}>查看记录</LoadingLink></p>;
}
