"use client";
import {useLayoutEffect, type RefObject} from "react";

/** 只调整文字与表单的可用空间，不触碰人物尺寸、校准和时间线。 */
export function useHomeClearance(stageRef: RefObject<HTMLDivElement | null>, mobile: boolean | null, phase: string) {
  useLayoutEffect(() => {
    const stage = stageRef.current, page = stage?.closest<HTMLElement>(".home-page");
    const footer = document.querySelector<HTMLElement>("[data-home-footer]");
    const form = stage?.querySelector<HTMLElement>(".login-form");
    const concepts = stage?.querySelector<HTMLElement>(".home-orbit-scene-start");
    const header = page?.querySelector<HTMLElement>(".home-header");
    if (!mobile || !stage || !page || !footer || !form || !concepts || !header) return;
    const measure = () => {
      if (page.dataset.imageFallback === "true") {
        page.removeAttribute("data-home-form-overflow"); page.removeAttribute("data-home-decoration-hidden"); return;
      }
      const stageBox = stage.getBoundingClientRect(), footerBox = footer.getBoundingClientRect();
      const headerHeight = header.getBoundingClientRect().height;
      page.style.setProperty("--home-header-height", `${headerHeight}px`);
      const loginVisible = phase !== "INTRO" && phase !== "REVERSE_ANIMATING";
      const formHeight = form.getBoundingClientRect().height;
      const top = stageBox.top + stageBox.height * .67 - formHeight / 2;
      const overflow = loginVisible && (top < stageBox.top + headerHeight + 8 || top + formHeight > footerBox.top - 12);
      page.style.setProperty("--home-form-top", `${Math.max(headerHeight + 12, Math.min(top - stageBox.top, footerBox.top - stageBox.top - 12 - formHeight))}px`);
      page.toggleAttribute("data-home-form-overflow", overflow);
      const formBottom = form.getBoundingClientRect().bottom;
      const conceptBox = concepts.getBoundingClientRect();
      const textOverflows = [...concepts.querySelectorAll<HTMLElement>(".home-principle")].some(node => node.scrollWidth > node.clientWidth + 1);
      page.toggleAttribute("data-home-decoration-hidden", textOverflows || conceptBox.bottom > footerBox.top - 8 || loginVisible && (overflow || formBottom + 12 > conceptBox.top));
    };
    const observer = new ResizeObserver(measure);
    [stage, footer, form, concepts, header].forEach(node => observer.observe(node));
    measure(); window.addEventListener("resize", measure);
    return () => {observer.disconnect(); window.removeEventListener("resize", measure); page.removeAttribute("data-home-form-overflow"); page.removeAttribute("data-home-decoration-hidden"); page.style.removeProperty("--home-header-height"); page.style.removeProperty("--home-form-top");};
  }, [stageRef, mobile, phase]);
}
