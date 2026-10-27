export type NumberComparison={label:string;value:string|number|null|undefined;previous:string|number|null|undefined;unit:string};
/** 仅提示可能多输／少输一位，不作健康判断；0与未知不参与倍数检查。 */
export function unusualNumbers(rows:NumberComparison[]){return rows.filter(row=>{const current=Number(row.value),before=Number(row.previous);return Number.isFinite(current)&&Number.isFinite(before)&&current>0&&before>0&&(current>=before*10||current<before/10);});}
export function confirmNumbers(rows:NumberComparison[],accepted?:Set<string>){const unusual=unusualNumbers(rows),signature=JSON.stringify(unusual);if(!unusual.length||accepted?.has(signature))return true;const confirmed=window.confirm(unusual.map(row=>`${row.label}：本次 ${Number(row.value)} ${row.unit}，上次 ${Number(row.previous)} ${row.unit}`).join("\n")+"\n数值变化较大，请核对。确定继续保存？");if(confirmed)accepted?.add(signature);return confirmed;}

export function numberChangeMessages(rows:NumberComparison[]){return unusualNumbers(rows).map(row=>`${row.label}：本次 ${Number(row.value)} ${row.unit}，上次 ${Number(row.previous)} ${row.unit}，保存前请核对。`);}
