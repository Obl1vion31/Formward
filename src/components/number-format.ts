const numbers=new Intl.NumberFormat("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
/** 仅改变显示，保存仍使用原数；轴刻度、日期、计数另行格式化。 */
export function formatRecordNumber(value:string|number|null|undefined):string{
 if(value==null||value==="")return "—";const n=Number(value);if(!Number.isFinite(n))return "—";const text=numbers.format(n);return text==="-0.00"?"0.00":text;
}
export function signedRecordNumber(value:string|number|null|undefined){const text=formatRecordNumber(value);return text==="—"||text==="0.00"?text:Number(value)>0?"+"+text:text;}
