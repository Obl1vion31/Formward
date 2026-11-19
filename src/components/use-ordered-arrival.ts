"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { createWorkspaceMotion, orderedDirection } from "./workspace-motion";

export function useOrderedArrival<T extends HTMLElement>(
  position: number,
  { from = position, enabled = true, distance = 16 }: { from?: number; enabled?: boolean; distance?: number } = {},
) {
  const node = useRef<T>(null);
  const previous = useRef(from);
  const motion = useMemo(() => createWorkspaceMotion(), []);
  useLayoutEffect(() => {
    const direction = orderedDirection(previous.current, position);
    previous.current = position;
    if (!enabled) motion.stop();
    else if (direction && node.current) motion.play(node.current, direction, {
      distance, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, [position, enabled, distance, motion]);
  useLayoutEffect(() => motion.stop, [motion]);
  return node;
}
