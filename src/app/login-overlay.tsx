"use client";

import { useState, type FormEvent, type RefObject } from "react";

// 父组件决定何时可操作、何时可提交；此组件负责输入值及表单 DOM。
// onInputFocus / onInputBlur 把焦点通知父级，由父级控制人物回中和阶段锁定。
type LoginOverlayProps = {
  overlayRef: RefObject<HTMLDivElement | null>;
  accessible: boolean;
  canSubmit: boolean;
  onEnter: () => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
};

export function LoginOverlay({ overlayRef, accessible, canSubmit, onEnter, onInputFocus, onInputBlur }: LoginOverlayProps) {
  // 受控输入：value 来源于 state，onChange 更新 state；倒放不会卸载组件，因此值保留。
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // 当前仅检查非空，email.trim() 去掉首尾空白；不是账号验证或密码正确性验证。
  const canEnter = canSubmit && email.trim().length > 0 && password.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // 拦截浏览器默认提交与页面刷新；当前只通知父级播放最终过渡，没有网络请求。
    event.preventDefault();
    if (canEnter) onEnter();
  }

  return (
    // inert 禁止交互和 Tab 聚焦；aria-hidden 同时从辅助技术中隐藏不可用的表单。
    <div className="login-overlay" ref={overlayRef} inert={!accessible} aria-hidden={!accessible}>
      {/* noValidate 跳过浏览器原生 email 格式校验；autoComplete="off" 是对浏览器的提示。 */}
      <form className="login-form" aria-label="登录" onSubmit={handleSubmit} autoComplete="off" noValidate>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" name="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} onFocus={onInputFocus} onBlur={onInputBlur} autoComplete="off" />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} onFocus={onInputFocus} onBlur={onInputBlur} autoComplete="off" />
        <button type="submit" disabled={!canEnter}><span>ENTER</span></button>
      </form>
    </div>
  );
}
