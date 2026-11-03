/** 按数值语义去尾零，不按显示位数舍入；空值与明确0仍不同。 */
export function numericDraftValue(value:string|number|null|undefined):string {
 const text=value==null?"":String(value).trim();
 if(!/^-?\d+(?:\.\d*)?$/.test(text))return text;
 const negative=text.startsWith("-"),[whole,fraction=""]=text.replace(/^-/,"").split(".");
 const number=whole.replace(/^0+(?=\d)/,"")+(fraction.replace(/0+$/,"")?"."+fraction.replace(/0+$/,""):"");
 return negative&&number!=="0"?"-"+number:number;
}
