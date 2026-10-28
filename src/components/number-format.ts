type Reading = string | number | null | undefined;
const bodyNumbers = new Intl.NumberFormat("zh-CN", {minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
const wholeNumbers = new Intl.NumberFormat("zh-CN", {maximumFractionDigits:0,useGrouping:false});
function formatted(value:Reading, formatter:Intl.NumberFormat):string {
 if(value==null||value==="")return "—";
 const number=Number(value);if(!Number.isFinite(number))return "—";
 const text=formatter.format(number);
 return text==="-0.00"?"0.00":text==="-0"?"0":text;
}
/** 只格式化展示，未修改的字段继续保存原始精度。 */
export const formatRecordNumber=(value:Reading)=>formatted(value,bodyNumbers);
export const formatIntegerNumber=(value:Reading)=>formatted(value,wholeNumbers);
function signed(value:Reading,format:(value:Reading)=>string) {
 const text=format(value);return text==="—"||Number(text)===0?text:Number(value)>0?"+"+text:text;
}
export const signedRecordNumber=(value:Reading)=>signed(value,formatRecordNumber);
export const signedIntegerNumber=(value:Reading)=>signed(value,formatIntegerNumber);
export const formatUnitNumber=(value:Reading,unit:string)=>(unit==="kg"||unit==="%")?formatRecordNumber(value):formatIntegerNumber(value);
