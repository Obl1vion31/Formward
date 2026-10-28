"use client";
import {useId,useState,type InputHTMLAttributes} from "react";
import {useDraftGuard} from "./draft-guard";
import {formatIntegerNumber,formatRecordNumber} from "./number-format";
/** 只有真实且有效的输入才更新草稿；显示和失焦不回写旧精度。 */
export function DecimalInput({value,onValue,precision=2,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"type"|"step">&{value:string|null|undefined;onValue:(value:string)=>void;precision?:0|2}){
 const [focused,setFocused]=useState(false),[editing,setEditing]=useState(""),[invalid,setInvalid]=useState(false),errorId=useId();
 useDraftGuard(precision===0&&invalid);
 const format=precision===0?formatIntegerNumber:formatRecordNumber;
 return <><input {...props} type="number" step={precision===0?"1":"0.01"} inputMode={precision===0?"numeric":"decimal"} aria-invalid={invalid||undefined} aria-describedby={[props["aria-describedby"],invalid?errorId:null].filter(Boolean).join(" ")||undefined} value={focused||invalid?editing:value==null||value===""?"":format(value)} onFocus={event=>{if(!invalid)setEditing(value==null||value===""?"":format(value));setFocused(true);props.onFocus?.(event);}} onBlur={event=>{setFocused(false);props.onBlur?.(event);}} onChange={event=>{
 const text=event.target.value,valid=!text||(precision===0?/^\d+$/:/^\d*(?:\.\d{0,2})?$/).test(text);
 if(valid){setInvalid(false);event.currentTarget.setCustomValidity("");setEditing(text);onValue(text);}
 else if(precision===0){setEditing(text);setInvalid(true);event.currentTarget.setCustomValidity("请输入整数");}
 }}/>{invalid&&<span id={errorId} role="alert" style={{fontSize:12,color:"#d89490",lineHeight:1.5}}>请输入整数，不填写小数。</span>}</>;
}
