"use client";
import { useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { LoadingLink } from "./loading-link";
import { confirmDraftDiscard, draftIsBusy } from "./draft-guard";
import { useChartTransition } from "./chart-transition-state";
import { workspacePages as pages } from "./workspace-pages";
import styles from "./mobile-navigation.module.css";
import glass from "./glass-controls.module.css";
import { useSlidingSelection } from "./sliding-selection";
import { usePrepareWorkspace } from "./workspace-navigation";
export function NavigationIcon({ index }: { index: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{index === 0 ? <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></> : index === 1 ? <><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 5-5 9h5"/></> : index === 2 ? <path d="m6.5 6.5 11 11M3 6l3-3 3 3-3 3Zm12 12 3-3 3 3-3 3ZM2 10l8-8m4 20 8-8"/> : index === 3 ? <path d="M13 3c1 5-2 5-1 9 2-1 3-3 3-5 4 4 5 7 3 11-3 5-11 3-12-2-1-4 2-6 3-8-1 4 1 5 2 5-1-4 2-6 2-10Z"/> : <><circle cx="12" cy="4" r="2"/><path d="m5 9 7 2 7-2M12 11v5m0 0-4 5m4-5 4 5"/></>}</svg>;
}
export function MobileNavigation({ pathname, onSelect }: { pathname: string; onSelect?: (href: string) => void }) {
  const router = useRouter();
  const chart = useChartTransition(), prepare = usePrepareWorkspace();
  const [, startTransition] = useTransition();
  const selected = pages.findIndex(([href]) => href === pathname);
  const canReturnToOverview = pathname !== "/dashboard" || chart.returningToOverview || Boolean(chart.forwardDestination);

  const slide = useSlidingSelection(selected, async target => {
    const href = pages[target][0];
    if (!onSelect && href === "/dashboard" && canReturnToOverview) return chart.back();
    if (draftIsBusy() || !await confirmDraftDiscard()) return false;
    if (onSelect) onSelect(href);
    else {
      chart.cancelOverviewReturn?.(href);
      prepare(href);
      startTransition(() => router.push(href));
    }
  });

  return <nav {...slide}
    className={`mobile-bottom-nav ${styles.mobileNav} ${glass.track}${onSelect ? " " + styles.previewNav : ""}`}
    style={{ "--nav-count": pages.length } as CSSProperties} aria-label="主导航" onDragStart={event => event.preventDefault()}>
    <span className={glass.selection} data-capsule-indicator aria-hidden="true"/>
    {pages.map(([href, label], index) =>
      <LoadingLink key={href} href={href} data-capsule-choice={index} aria-current={pathname === href ? "page" : undefined}
        onNavigate={onSelect ? event => { event.preventDefault(); onSelect(href); }
          : href === "/dashboard" && canReturnToOverview ? event => { event.preventDefault(); void chart.back(); }
            : () => chart.cancelOverviewReturn?.(href)}>
        <NavigationIcon index={index}/><span>{label}</span>
      </LoadingLink>
    )}
  </nav>;
}
