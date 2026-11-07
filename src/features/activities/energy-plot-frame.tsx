import type { ReactNode, RefObject } from 'react';
/** CSS 在设备识别与 SVG 测量之前预留最终绘图区，真实图与骨架共同使用。 */
export function EnergyPlotFrame({ children, frameRef, adaptive = false, className = '' }: { children: ReactNode; frameRef?: RefObject<HTMLDivElement | null>; adaptive?: boolean | 'auto'; className?: string }) { return <div ref={frameRef} data-chart-arrival data-linked-plot={className.includes('linked-trend-plot') || undefined} className={'energy-plot-frame ' + className}><div className="energy-plot-space" data-energy-adaptive={adaptive}>{children}</div></div>; }
