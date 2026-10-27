"use client";
import {useState,type InputHTMLAttributes} from "react";
import {formatRecordNumber} from "./number-format";
/** 展示两位不回写旧值；只有真实输入事件才更新父级草稿。 */
export function DecimalInput({value,onValue,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"type"|"step">&{value:string|null|undefined;onValue:(value:string)=>void}){
 const [focused,setFocused]=useState(false),[editing,setEditing]=useState("");
 return <input {...props} type="number" step="0.01" inputMode="decimal" value={focused?editing:value==null||value===""?"":formatRecordNumber(value)} onFocus={event=>{setEditing(value==null||value===""?"":formatRecordNumber(value));setFocused(true);props.onFocus?.(event);}} onBlur={event=>{setFocused(false);props.onBlur?.(event);}} onChange={event=>{const text=event.target.value;if(!text||/^\d*(?:\.\d{0,2})?$/.test(text)){setEditing(text);onValue(text);}}}/>;
}
