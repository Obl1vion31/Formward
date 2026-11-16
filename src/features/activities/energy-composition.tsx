import {formatIntegerNumber} from "../../components/number-format";
export function energyComposition(resting:string|null|undefined,active:string|null|undefined){
 if(resting==null||active==null)return null;
 const r=Number(resting),a=Number(active),sum=r+a;
 return Number.isFinite(sum)&&r>=0&&a>=0&&sum>0?{resting:r/sum,active:a/sum}:null;
}
export function EnergyComposition({resting,active,loading=false}:{resting:string|null|undefined;active:string|null|undefined;loading?:boolean}){
 const shares=energyComposition(resting,active);
 return <figure className="energy-composition" aria-label={loading?'消耗分项加载中':shares?'当天静息与活动占比':'消耗分项暂无可计算占比'}>
 <div className="energy-share-track" role="img" aria-label={shares?`静息 ${(shares.resting*100).toFixed(1)}%，活动 ${(shares.active*100).toFixed(1)}%`:'分项未知或总量为零'}>
 {shares&&<><span style={{width:shares.resting*100+'%',background:'var(--data-blue)'}}/><span style={{width:shares.active*100+'%',background:'var(--data-red)'}}/></>}
 </div><figcaption style={{minHeight:21}}><span>静息 <span className="energy-share-value">{loading?"—":formatIntegerNumber(resting)}</span>{shares?" · "+(shares.resting*100).toFixed(1)+"%":""}</span><span>活动 <span className="energy-share-value">{loading?"—":formatIntegerNumber(active)}</span>{shares?" · "+(shares.active*100).toFixed(1)+"%":""}</span></figcaption>
 </figure>;
}
