/** 数据已到、绘图区尚待测量时保留图框；透明反馈不遮盖正在承接的来源图。 */
export function ChartPreparation({active}:{active:boolean}){
 return active?<div className="chart-preparation" role="status"><span>正在准备趋势…</span></div>:null;
}
