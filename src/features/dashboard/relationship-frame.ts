import type {CSSProperties} from "react";
/** 等待框与真实SVG共享几何，不用虚构数据撑高。 */
export function relationshipFrame(compact:boolean,short=false){
 const top=compact?16:26,energyHeight=compact?(short?104:132):220,energyBottom=top+energyHeight;
 const weightTop=energyBottom+(compact?32:56),weightBottom=weightTop+(compact?(short?56:68):112);
 return {top,energyHeight,energyBottom,weightTop,weightBottom,height:weightBottom+(compact?28:34)};
}
export const relationshipFrameStyle={"--relationship-full-height":relationshipFrame(false).height+"px","--relationship-compact-height":relationshipFrame(true).height+"px","--relationship-short-height":relationshipFrame(true,true).height+"px"} as CSSProperties;
