import type { MetricTrendModel } from './metric-trend-model';

export type ChartRect = { left: number; top: number; width: number; height: number };
export type ChartFlight = {
  id: number; model: MetricTrendModel; rect: ChartRect; direction: 'forward' | 'back';
  node?: HTMLElement; destination?: ChartRect; landing?: boolean; arrived?: boolean; ready?: boolean;
  animation?: Animation; decorations?:Animation[]; hidden?: SVGSVGElement; deadline?: ReturnType<typeof setTimeout>; startFrame?:number;
};
type ChartFlights = {
  active: ChartFlight | null; returning: boolean;
  clear: (expectedId?: number) => boolean;
  start: (model: MetricTrendModel, rect: ChartRect, direction: ChartFlight['direction']) => ChartFlight;
  beginReturn: (source?: { model: MetricTrendModel; rect: ChartRect } | null) => boolean;
};

/** 一次导航拥有一个图层；返回意图在 popstate 和路由提交间保持幂等。 */
export function createChartFlights(publish: (flight: ChartFlight | null) => void) {
  let serial = 0;
  const owner: ChartFlights = {
    active: null as ChartFlight | null,
    returning: false,
    clear(expectedId = owner.active?.id) {
      const current = owner.active;
      if (!current || current.id !== expectedId) return false;
      owner.active = null;
      // cancel 会撤掉 fill:forwards。先退出可见合成，不能让原始大图再画一帧。
      if (current.node) current.node.style.visibility = 'hidden';
      clearTimeout(current.deadline);
      if(current.startFrame!==undefined)cancelAnimationFrame(current.startFrame);
      current.animation?.cancel();
      current.decorations?.forEach(animation=>animation.cancel());
      current.hidden?.removeAttribute('data-chart-travelling');
      publish(null);
      return true;
    },
    start(model: MetricTrendModel, rect: ChartRect, direction: ChartFlight['direction']) {
      owner.clear();
      if (direction === 'forward') owner.returning = false;
      const current: ChartFlight = { id: ++serial, model, rect, direction };
      current.deadline = setTimeout(() => owner.clear(current.id), 8000);
      owner.active = current;
      publish(current);
      return current;
    },
    beginReturn(source?: { model: MetricTrendModel; rect: ChartRect } | null) {
      if (owner.returning) return false;
      owner.returning = true;
      if (source) owner.start(source.model, source.rect, 'back');
      else owner.clear();
      return true;
    },
  };
  return owner;
}
