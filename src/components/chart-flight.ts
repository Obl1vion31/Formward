import {trendKey,trendRangeKey,type MetricTrendModel} from './metric-trend-model';

export type ChartRect = { left: number; top: number; width: number; height: number };
export const chartModelMatches=(expected:{rangeKey:string;modelKey:string},model:MetricTrendModel)=>expected.rangeKey===trendRangeKey(model)&&expected.modelKey===trendKey(model);
export const chartRectMatches=(before:ChartRect,after:ChartRect)=>Math.max(Math.abs(before.left-after.left),Math.abs(before.top-after.top),Math.abs(before.width-after.width),Math.abs(before.height-after.height))<=1;
export type ChartFlightRelease = 'cancel' | 'complete' | 'timeout';
export type ChartHandoff = {id:number;model:MetricTrendModel;destination?:ChartRect};
export type ChartHandoffTarget = {element:SVGSVGElement;model:MetricTrendModel;rect:ChartRect;skeleton?:boolean};
export type ChartFlight = {
  id: number; model: MetricTrendModel; rect: ChartRect; direction: 'forward' | 'back';
  node?: HTMLElement; destination?: ChartRect; landing?: boolean; arrived?: boolean; ready?: boolean;
  animation?: Animation; decorations?:Animation[]; hidden?: SVGSVGElement; deadline?: ReturnType<typeof setTimeout>;
  entryKeys?: Set<string>;
};
type ChartFlights = {
  active: ChartFlight | null; handoff:ChartHandoff|null; returning: boolean;
  clear: (expectedId?: number) => boolean;
  complete: (expectedId: number) => boolean;
  expire: (expectedId: number) => boolean;
  acceptHandoff: (expectedId:number,target:ChartHandoffTarget) => boolean;
  claimEntry: (key: string, container?: HTMLElement | null) => boolean;
  start: (model: MetricTrendModel, rect: ChartRect, direction: ChartFlight['direction']) => ChartFlight;
  reveal: (id: number, target: SVGSVGElement | null) => boolean;
  beginReturn: (source?: { model: MetricTrendModel; rect: ChartRect } | null) => boolean;
};

/** 一次导航拥有一个图层；返回意图在 popstate 和路由提交间保持幂等。 */
export function createChartFlights(publish: (flight: ChartFlight | null,reason?:ChartFlightRelease) => void) {
  let serial = 0;
  const entries=new Set<string>(),handedOff=new WeakSet<SVGSVGElement>();
  const release=(current:ChartFlight,reason:ChartFlightRelease)=>{
    owner.active=null;
    // 无论超时还是取消，都先撤掉合成，再恢复真实/静态目标，不能保留无限浮层。
    if(current.node)current.node.style.visibility='hidden';
    clearTimeout(current.deadline);current.animation?.cancel();current.decorations?.forEach(animation=>animation.cancel());
    current.hidden?.removeAttribute('data-chart-travelling');
    publish(null,reason);
  };
  const commitEntry=(current:ChartFlight)=>{
    if(current.entryKeys?.size)current.entryKeys.forEach(key=>entries.add(key));
    else if(current.hidden)handedOff.add(current.hidden);
  };
  const owner: ChartFlights = {
    active: null as ChartFlight | null,
    handoff:null,
    returning: false,
    claimEntry(key,container) {
      const current=owner.active;
      // 快数据的父图先登记实际viewKey；只有这次共享交接成功结束才消费。
      if(current?.direction==='forward'&&current.ready&&current.hidden&&container?.contains(current.hidden)){
        (current.entryKeys??=new Set()).add(key);
        return false;
      }
      let received=false;
      if(container)for(const node of container.querySelectorAll<SVGSVGElement>('[data-trend-glyph]'))if(handedOff.delete(node))received=true;
      const seen=entries.has(key);entries.add(key);
      return !seen&&!received;
    },
    complete(expectedId) {
      const current=owner.active;
      if(!current||current.id!==expectedId||!current.arrived||!current.ready)return false;
      if(current.direction==='forward'&&(!current.hidden||current.hidden.isConnected===false)){owner.clear(expectedId);return false;}
      // 迟到数据的子图会先完成交接；保存真实SVG身份供随后父图绑定自己的viewKey。
      if(current.direction==='forward'&&current.hidden)commitEntry(current);
      owner.handoff=null;release(current,'complete');return true;
    },
    reveal(id, target) {
      const current=owner.active;
      if(!current||current.id!==id||!current.node)return false;
      // 等待时原图仍可见；同一帧先显示浮层，再交出目标，不能有双双隐藏的空档。
      if(current.node.style.visibility!=='visible')current.node.style.visibility='visible';
      if(current.hidden!==target){
        current.hidden?.removeAttribute('data-chart-travelling');
        current.hidden=target??undefined;
        target?.setAttribute('data-chart-travelling','true');
      }
      return true;
    },
    clear(expectedId = owner.active?.id??owner.handoff?.id) {
      const current=owner.active;
      if(current&&current.id===expectedId){owner.handoff=null;release(current,'cancel');return true;}
      if(owner.handoff&&owner.handoff.id===expectedId){owner.handoff=null;publish(null,'cancel');return true;}
      return false;
    },
    expire(expectedId) {
      const current=owner.active;if(!current||current.id!==expectedId)return false;
      if(current.direction!=='forward')return owner.clear(expectedId);
      if(current.ready){
        if(!current.destination||!current.hidden||current.hidden.isConnected===false)return owner.clear(expectedId);
        // 数据已在目标，仅合成动画没完成时，以静态目标结束同一次交接。
        commitEntry(current);owner.handoff=null;release(current,'complete');return true;
      }
      // 8秒只结束移动图层；等待记录不含DOM/Animation，供同次导航继续显示真实来源。
      owner.handoff={id:current.id,model:current.model,destination:current.destination?{...current.destination}:undefined};
      release(current,'timeout');return true;
    },
    acceptHandoff(expectedId,next) {
      const saved=owner.handoff;if(!saved||saved.id!==expectedId)return false;
      if(!chartModelMatches({rangeKey:trendRangeKey(saved.model),modelKey:trendKey(saved.model)},next.model)||!next.rect.width||!next.rect.height){owner.clear(expectedId);return false;}
      if(saved.destination&&!chartRectMatches(saved.destination,next.rect)){owner.clear(expectedId);return false;}
      if(next.skeleton){saved.destination??={...next.rect};return true;}
      // 未经目标外壳落位的普通冷图，或已卸载目标，不得借用来源消费首次绘制。
      if(!saved.destination||next.element.isConnected===false){owner.clear(expectedId);return false;}
      handedOff.add(next.element);owner.handoff=null;publish(null,'complete');return true;
    },
    start(model: MetricTrendModel, rect: ChartRect, direction: ChartFlight['direction']) {
      owner.clear();
      if (direction === 'forward') owner.returning = false;
      const current: ChartFlight = { id: ++serial, model, rect, direction };
      current.deadline = setTimeout(() => owner.expire(current.id), 8000);
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
