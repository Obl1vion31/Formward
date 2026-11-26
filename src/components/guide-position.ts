import { readPopoverBounds } from "./anchored-popover";

export type GuideStep = { target: string; text: string };
export type GuideBox = { left: number; top: number; right: number; bottom: number };
type Side = "top" | "bottom" | "left" | "right";
type Placement = { left: number; top: number; side?: Side };

const hidden = "[inert],[hidden],fieldset[disabled],[data-return-prepared]";
const guideUI = "[data-guide-float]:popover-open";
const gap = 10;

export function guidePresent(element: HTMLElement | null): element is HTMLElement {
  return !!element?.getClientRects().length && !element.closest(hidden) &&
    !element.matches(":disabled,[aria-disabled=true]") && getComputedStyle(element).visibility === "visible";
}

export function guideScope(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>("[data-guide-scope],dialog,[data-assistant-page],[data-record-workspace]") ?? document.body;
}

export function guideTarget(trigger: HTMLElement, name: string) {
  return Array.from(guideScope(trigger).querySelectorAll<HTMLElement>("[data-guide-target]"))
    .find(node => node.dataset.guideTarget === name && guidePresent(node));
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
  width: number; sides: Side[]; avoid?: GuideBox[]; dock?: boolean; nearest?: boolean;
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
    return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom &&
      !options.avoid?.some(obstacle => !!intersectGuideBox(box, obstacle));
  }
  let placement = options.sides.map(side => candidates[side]).find(free);
  if (!placement && options.nearest) {
    // In short forms, look for the closest clear space on the same surface.
    const rows = [bounds.top, bounds.bottom - height, candidates.top.top, candidates.bottom.top,
      ...(options.avoid ?? []).flatMap(box => [box.top - height - 4, box.bottom + 4])];
    const detours = rows.flatMap(top => {
      const below = top - anchor.bottom, above = anchor.top - top - height;
      const distance = Math.max(above, below);
      if (distance < gap || distance > 140) return [];
      const side: Side = below >= gap ? "top" : "bottom";
      return [x, bounds.left, bounds.right - width].map(left => ({ left, top, side, distance }));
    });
    placement = detours.filter(free).sort((a, b) => a.distance - b.distance || Math.abs(a.left - x) - Math.abs(b.left - x))[0];
  }
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

export function operationObstacles(scope: HTMLElement, anchor: HTMLElement) {
  const controls = scope.querySelectorAll<HTMLElement>(
    "input,textarea,select,button,a[href],summary,[role=button],[contenteditable=true],[data-record-slot=metrics],[data-guide-reading],[data-entry-footer],[data-meal-footer],[data-review-footer]",
  );
  const obstacles = Array.from(controls).filter(control => guidePresent(control) && !anchor.contains(control) && !control.closest("[data-guide-float]"));
  const guideGroup = anchor.closest<HTMLElement>("[data-guide-flow]");
  if (guideGroup && guideGroup !== anchor) obstacles.push(guideGroup);
  return obstacles.map(element => element.getBoundingClientRect());
}
