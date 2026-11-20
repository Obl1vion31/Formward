"use client";

import { useEffect } from "react";
import { confirmDraftDiscard, draftIsBusy } from "./draft-guard";

type HostEvent = { type: "ready" | "appearance" | "back-pending" | "back-result"; id?: string; handled?: boolean; theme?: string };
type NativeWindow = Window & { FormwardNative?: { postEvent: (message: string) => void } };

/** Only UI state crosses this boundary. Cookies, form values and health records stay in the web page. */
export function NativeHost() {
  useEffect(() => {
    const native = (window as NativeWindow).FormwardNative;
    if (typeof native?.postEvent !== "function") return;
    const send = (event: HostEvent) => { try { native.postEvent(JSON.stringify(event)); } catch {} };
    const appearance = () => send({ type: "appearance", theme: document.documentElement.dataset.theme === "light" ? "light" : "dark" });
    const observer = new MutationObserver(appearance);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    send({ type: "ready" });
    appearance();
    let pending = false;
    const back = async (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const id = event.detail?.id;
      if (typeof id !== "string" || !/^[0-9-]{1,64}$/.test(id)) return;
      if (pending) return;
      pending = true;
      send({ type: "back-pending", id });
      let handled = true;
      try {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.matches("input,textarea,[contenteditable=true]")) {
          active.blur();
        } else {
          const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"));
          const dialog = dialogs.at(-1);
          if (dialog) {
            dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
          } else {
            const dismiss = new Event("formward-native-dismiss", { cancelable: true });
            window.dispatchEvent(dismiss);
            if (dismiss.defaultPrevented) return;
            const menu = document.querySelector<HTMLDetailsElement>("details[open]");
            if (menu) {
              menu.querySelector("summary")?.click();
            } else if (!draftIsBusy()) {
              handled = !await confirmDraftDiscard();
            }
          }
        }
      } finally {
        pending = false;
        send({ type: "back-result", id, handled });
      }
    };
    const request = (event: Event) => { void back(event); };
    window.addEventListener("formward-native-back", request);
    return () => {
      observer.disconnect();
      window.removeEventListener("formward-native-back", request);
    };
  }, []);
  return null;
}
