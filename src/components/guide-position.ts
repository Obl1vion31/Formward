import { readPopoverBounds } from "./anchored-popover";

export type GuideStep = { target: string; text: string };
export type GuideBox = { left: number; top: number; right: number; bottom: number };
type Side = "top" | "bottom" | "left" | "right";
type Placement = { left: number; top: number; side?: Side };

const hidden = "[inert],[hidden],[data-return-prepared]";
const guideUI = "[data-guide-float]:popover-open";
const gap = 10;

function guideVisible(element: HTMLElement | null): element is HTMLElement {
  return !!element?.getClientRects().length && !element.closest(hidden) && getComputedStyle(element).visibility === "visible";
}

export function guidePresent(element: HTMLElement | null, retainedHelp = false): element is HTMLElement {
  // 缓存校验中的静态帮助入口仍可使用，旧业务目标与控件继续排除。
  return guideVisible(element) && (retainedHelp || !element.closest("fieldset[disabled]")) && !element.matches(":disabled,[aria-disabled=true]");
}

export function guideScope(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>("[data-guide-scope],dialog,[data-assistant-page],[data-record-workspace]") ?? document.body;
}

export function guideTarget(trigger: HTMLElement, name: string) {
  return Array.from(guideScope(trigger).querySelectorAll<HTMLElement>("[data-guide-target]"))
    .find(node => node.dataset.guideTarget === name && guidePresent(node) && !node.closest('[data-workspace-reading="true"]'));
}

export function openGuide(node: HTMLElement | null) {
  if (!node?.isConnected) return;
  window.dispatchEvent(new CustomEvent("formward-guide-open", { detail: node }));
  for (const other of document.querySelectorAll<HTMLElement>(guideUI)) if (other !== node) other.hidePopover();
  if (!node.matches(":popover-open")) node.showPopover();
}

export function intersectGuideBox(a: GuideBox, b: GuideBox): GuideBox | null {
  const box = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return box.right > box.left && box.bottom > box.top ? box : null;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function guidePageBounds(margin: number) {
  const box = readPopoverBounds(document.body, margin);
  const header = document.querySelector(".dashboard-header")?.getBoundingClientRect();
  const dock = document.querySelector("[data-workspace-dock]")?.getBoundingClientRect();
  if (header?.height) box.top = Math.max(box.top, header.bottom + margin);
  if (dock?.height) box.bottom = Math.min(box.bottom, dock.top - margin);
  return box;
}

/** Positions the whole card, including its controls, inside the usable viewport. */
export function placeGuideCard(panel: HTMLElement, anchor: GuideBox, bounds: GuideBox, options: {
  width: number; sides: Side[]; dock?: boolean;
}): GuideBox | null {
  const width = Math.min(options.width, bounds.right - bounds.left);
  const room = bounds.bottom - bounds.top;
  if (width < 96 || room < 44) return null;
  panel.style.inlineSize = width + "px";
  panel.style.maxBlockSize = options.dock ? room + "px" : "";
  const height = panel.getBoundingClientRect().height;
  if (!height || height > room) return null;

  const center = (anchor.left + anchor.right) / 2;
  const middle = (anchor.top + anchor.bottom) / 2;
  const x = clamp(center - width / 2, bounds.left, bounds.right - width);
  const y = clamp(middle - height / 2, bounds.top, bounds.bottom - height);
  const candidates: Record<Side, Placement> = {
    top: { left: x, top: anchor.bottom + gap, side: "top" },
    bottom: { left: x, top: anchor.top - gap - height, side: "bottom" },
    left: { left: anchor.right + gap, top: y, side: "left" },
    right: { left: anchor.left - gap - width, top: y, side: "right" },
  };
  function free(placement: Placement) {
    const box = { left: placement.left, top: placement.top, right: placement.left + width, bottom: placement.top + height };
    return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
  }
  let placement = options.sides.map(side => candidates[side]).find(free);
  let aperture = anchor;
  if (!placement && options.dock) {
    const atTop = middle > (bounds.top + bounds.bottom) / 2;
    placement = { left: x, top: atTop ? bounds.top : bounds.bottom - height };
    const exposed = intersectGuideBox(anchor, { ...bounds,
      top: atTop ? bounds.top + height + gap : bounds.top,
      bottom: atTop ? bounds.bottom : bounds.bottom - height - gap });
    if (!exposed) return null;
    aperture = exposed;
  }
  if (!placement) return null;
  panel.style.left = placement.left + "px";
  panel.style.top = placement.top + "px";
  panel.dataset.pointSide = placement.side ?? "";
  panel.style.setProperty("--pointer-left", clamp(center - placement.left, 13, width - 13) + "px");
  panel.style.setProperty("--pointer-top", clamp(middle - placement.top, 13, height - 13) + "px");
  return aperture;
}
