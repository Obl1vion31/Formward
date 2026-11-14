"use client";
import type { InputHTMLAttributes } from "react";
import styles from "./date-field.module.css";

/** 原生日期选择保留键盘和系统选择器，只有外层绘制可见边框。 */
export function DateField({value, ...props}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {value: string}) {
 return <span className={styles.field} data-date-field><span aria-hidden="true">{value ? value.replaceAll("-", ".") : "选择日期"}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 3v6m8-6v6M4 12h16"/></svg></span><input {...props} type="date" value={value}/></span>;
}
