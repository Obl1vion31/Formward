"use client";

import { useState, type FormEvent, type RefObject } from "react";

// 父组件决定何时可操作、何时可提交；此组件负责输入值及表单 DOM。
// onInputFocus / onInputBlur 把焦点通知父级，由父级控制人物回中和阶段锁定。
type LoginOverlayProps = {
  overlayRef: RefObject<HTMLDivElement | null>;
  accessible: boolean;
  canSubmit: boolean;
  pending: boolean;
  error: string | null;
  onEnter: (email: string, password: string) => Promise<void>;
  onInputFocus: () => void;
  onInputBlur: () => void;
};

export function LoginOverlay({ overlayRef, accessible, canSubmit, pending, error, onEnter, onInputFocus, onInputBlur }: LoginOverlayProps) {
  // 受控输入：value 来源于 state，onChange 更新 state；倒放不会卸载组件，因此值保留。
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // 非空只控制按钮；真实凭据由服务端认证。密码不进入 localStorage 或公开资源。
  const canEnter = canSubmit && email.trim().length > 0 && password.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // 父级负责认证和动画顺序；失败仍停留在可重试的 Frame 12。
    event.preventDefault();
    if (canEnter) void onEnter(email, password);
  }

  return (
    // inert 禁止交互和 Tab 聚焦；aria-hidden 同时从辅助技术中隐藏不可用的表单。
    <div className="login-overlay" ref={overlayRef} inert={!accessible} aria-hidden={!accessible}>
      <form className="login-form" aria-label="登录" onSubmit={handleSubmit} aria-busy={pending} noValidate>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" name="email" inputMode="email" value={email} disabled={!canSubmit} onChange={(event) => setEmail(event.target.value)} onFocus={onInputFocus} onBlur={onInputBlur} autoComplete="username" aria-describedby={error ? "login-error" : undefined} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" name="password" value={password} disabled={!canSubmit} onChange={(event) => setPassword(event.target.value)} onFocus={onInputFocus} onBlur={onInputBlur} autoComplete="current-password" aria-describedby={error ? "login-error" : undefined} />
        <button type="submit" disabled={!canEnter}><span>{pending ? "正在验证…" : "ENTER"}</span></button>
        {error && <p className="login-error" id="login-error" role="alert">{error}</p>}
      </form>
    </div>
  );
}
