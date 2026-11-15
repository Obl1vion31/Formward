"use client";
import {useLayoutEffect, useRef, useSyncExternalStore} from "react";
import {appInformation} from "@/components/app-information-content";
import {useAppInformation} from "@/components/app-information";
import styles from "./home-footer.module.css";

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

export function HomeFooter() {
  const hydrated = useSyncExternalStore(subscribe, client, server);
  const ref = useRef<HTMLElement>(null), openInformation = useAppInformation();
  useLayoutEffect(() => {
    const node = ref.current, shell = node?.parentElement;
    if (!node || !shell) return;
    const measure = () => shell.style.setProperty("--home-footer-height", `${node.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure); observer.observe(node); measure();
    return () => {observer.disconnect(); shell.style.removeProperty("--home-footer-height");};
  }, []);
  return <footer ref={ref} className={styles.footer} data-home-footer><a href={appInformation.icpUrl} target="_blank" rel="noopener noreferrer">{appInformation.icpNumber}</a><span aria-hidden="true">·</span><button type="button" aria-haspopup="dialog" disabled={!hydrated} onClick={openInformation}>更多信息</button></footer>;
}
