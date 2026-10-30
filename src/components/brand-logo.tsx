import styles from "./brand-logo.module.css";

/** 图形使用同一份透明 SVG；名称与链接的可访问标签由外层入口提供。 */
export function BrandLogo({ compactOnMobile = false }: { compactOnMobile?: boolean }) {
  return <span className={styles.brand + (compactOnMobile ? " " + styles.compact : "")} aria-hidden="true">
    <span className={styles.mark} />
    <span className={styles.word}>formward<span className={styles.dot}>.</span></span>
  </span>;
}
