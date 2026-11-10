"use client";

import Script from "next/script";
import { useRef, useState } from "react";
import { DoubaoReturnError, notifyDoubao, type WebViewSdk } from "./return-bridge";

type Callback = { requestId: string; refused: boolean; developerLoginCode?: string };
type Phase = "loading" | "sending" | "sent" | "environment" | "sdk" | "timeout" | "bridge";
const messages: Record<Phase, string> = {
  loading: "正在准备返回豆包…", sending: "正在通知豆包…", sent: "已通知豆包，你可以继续对话。",
  environment: "此页需在豆包 App 内打开。请返回豆包重新发起连接。",
  sdk: "豆包连接组件未能就绪，请重新加载连接页；仍失败时请返回豆包重新发起。",
  timeout: "暂未收到豆包的回传确认，请重试。",
  bridge: "暂时无法通知豆包，请重试或从豆包对话重新发起连接。",
};

export function DoubaoCallback({ result, insideDoubao }: { result: Callback; insideDoubao: boolean }) {
  const [phase, setPhase] = useState<Phase>(insideDoubao ? "loading" : "environment");
  const working = useRef(false);
  async function send() {
    if (working.current || phase === "sent") return;
    working.current = true; setPhase("sending");
    try {
      const sdk = (window as Window & { doubao?: WebViewSdk }).doubao;
      await notifyDoubao(sdk, { type: "formward.authorization", requestId: result.requestId, refused: result.refused, ...(!result.refused ? { code: result.developerLoginCode } : {}) });
      setPhase("sent");
    } catch (failure) {
      setPhase(failure instanceof DoubaoReturnError ? failure.kind : "bridge");
      working.current = false;
    }
  }
  const failed = ["environment", "sdk", "timeout", "bridge"].includes(phase);
  return <>
    <p>{result.refused ? "这次连接未获授权。" : "Formward 账号授权已完成。"}</p>
    <p role={failed ? "alert" : "status"} className={failed ? "oauth-error" : undefined}>{messages[phase]}</p>
    {phase === "sdk" && <button type="button" className="ai-button" onClick={() => window.location.reload()}>重新加载连接页</button>}
    {(phase === "timeout" || phase === "bridge") && <button type="button" className="ai-button" onClick={() => void send()}>重试返回豆包</button>}
    {insideDoubao && <Script src="https://lf3-static.bytednsdoc.com/obj/eden-cn/msvdeh7pfhpquly/doubao-jssdk-0.0.41.js" strategy="afterInteractive" onReady={() => void send()} onError={() => setPhase("sdk")} />}
  </>;
}
