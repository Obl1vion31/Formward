"use client";
import {useState,type ReactNode} from "react";
/** 关闭时不挂载内容，私有原图只在用户展开后请求。 */
export function Disclosure({summary,children,className}:{summary:ReactNode;children:ReactNode;className?:string}){
 const [open,setOpen]=useState(false);
 return <details className={className} onToggle={event=>setOpen(event.currentTarget.open)}><summary>{summary}</summary>{open&&<div>{children}</div>}</details>;
}
