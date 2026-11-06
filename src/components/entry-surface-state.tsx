"use client";
import {createContext,useCallback,useContext,useLayoutEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {InspectorProps} from './inspector';
import {DraftGuardContext,DraftCloseContext,type DraftState} from './draft-guard';
export type EntryMetadata=Omit<InspectorProps,'children'|'routeEntry'|'header'> & {customHeader:boolean};
export type EntryGuards={register:(state:DraftState)=>()=>void;close:()=>void};
export const EntrySurfaceContext=createContext<{active:boolean;slot:HTMLElement|null;headerSlot:HTMLElement|null;guards:EntryGuards|null;register:(meta:EntryMetadata)=>()=>void;reportFailure:(reset:()=>void)=>void}>({active:false,slot:null,headerSlot:null,guards:null,register:()=>()=>{},reportFailure:()=>{}});
export function RouteEntryContent(props:InspectorProps){
 const host=useContext(EntrySurfaceContext),latest=useRef(props),{register}=host;
 useLayoutEffect(()=>{latest.current=props;},[props]);
 const close=useCallback(()=>latest.current.close(),[]);
 useLayoutEffect(()=>register({title:props.title,titleParts:props.titleParts,stableScroll:props.stableScroll,wide:props.wide,busy:props.busy,compact:props.compact,className:props.className,close,closeLabel:props.closeLabel,onCloseReady:props.onCloseReady,onSavedCloseReady:props.onSavedCloseReady,customHeader:!!props.header}),[register,close,props.title,props.titleParts,props.stableScroll,props.wide,props.busy,props.compact,props.className,props.closeLabel,props.onCloseReady,props.onSavedCloseReady,props.header]);
 const protect=(content:ReactNode)=>host.guards?<DraftGuardContext value={host.guards.register}><DraftCloseContext value={host.guards.close}>{content}</DraftCloseContext></DraftGuardContext>:content;
 return <>{host.slot&&createPortal(protect(props.children),host.slot)}{host.headerSlot&&props.header&&createPortal(protect(props.header),host.headerSlot)}</>;
}
