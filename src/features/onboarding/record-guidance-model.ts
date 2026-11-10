export const recordGuides = {
 meals: {label:"饮食",path:"/dashboard/meals",form:"meal",entry:"录入一餐",fields:"填写本次吃的食物和份量，也可以从食材库添加。营养未知可以留空。",save:"核对日期与餐次后，点这里保存。本次引导不会替你提交。"},
 energy: {label:"消耗",path:"/dashboard/energy",form:"energy",entry:"录入每日消耗",fields:"选择分开记录或只记总数，再填写已知数值。运动明细可以在下方添加。",save:"核对日期、数值和运动包含关系后保存。本次引导不会替你提交。"},
 body: {label:"身体",path:"/dashboard/measurements",form:"body",entry:"录入身体测量",fields:"选择晨间或晚间，填写实际测量值。开启体脂后可以同时填写，缺测留空。",save:"确认时段与日期后保存。完成引导不会保存或清空已经填写的内容。"},
 training: {label:"训练",path:"/dashboard/training",form:"training",entry:"开始或继续训练",fields:"添加实际要练的动作，填写每组数据并勾选完成。未完成组不会计入结束记录。",save:"实际练完后再结束训练。也可以保存并收起，下次继续；完成引导不会结束训练。"},
} as const;
export type RecordGuideKind = keyof typeof recordGuides;
export const guideKindForPath=(path:string)=> (Object.keys(recordGuides) as RecordGuideKind[]).find(kind=>recordGuides[kind].path===path)??null;
export const recordGuideKey=(account:string,kind:RecordGuideKind)=>`formward:record-guide:v1:${encodeURIComponent(account)}:${kind}`;

/** 有限视口内优先避让目标；矮屏和键盘缩小时提示自身可滚动。 */
export function guidePlacement(target:{left:number;top:number;right:number;bottom:number},viewport:{left:number;top:number;width:number;height:number},size:{width:number;height:number}){
 const gap=12,edge=12,width=Math.min(size.width,viewport.width-2*edge),height=Math.min(size.height,viewport.height-2*edge);
 const minX=viewport.left+edge,maxX=viewport.left+viewport.width-edge-width;
 const below=target.bottom+gap,above=target.top-gap-height;
 const preferred=below+height<=viewport.top+viewport.height-edge?below:above>=viewport.top+edge?above:viewport.top+viewport.height-edge-height;
 const top=Math.max(viewport.top+edge,Math.min(preferred,viewport.top+viewport.height-edge-height));
 return {left:Math.max(minX,Math.min((target.left+target.right-width)/2,maxX)),top,width,height};
}
