"use client";
import { LoadingLink } from "@/components/loading-link";
import { BrandLogo } from "@/components/brand-logo";
import { AppearanceSync, AppearanceToggle } from "@/components/appearance-switch";
import styles from "./console.module.css";

export function AdminHeader() {
  return <header className={styles.header}><AppearanceSync/><LoadingLink className={styles.brand} href="/dashboard" aria-label="Formward 主页"><BrandLogo compactOnMobile/></LoadingLink><span className={styles.headerTitle}>管理后台</span><div className={styles.headerActions}><span className={styles.appearance}><AppearanceToggle/></span><LoadingLink href="/dashboard">返回网站</LoadingLink></div></header>;
}
