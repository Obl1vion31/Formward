"use client";
import {useCallback,useContext,useEffect,useLayoutEffect,useMemo,useState,type ReactNode} from "react";
import {usePathname,useSearchParams} from "next/navigation";
import {LocalLoading} from "@/components/local-loading";
import {WorkspaceCache,workspaceCacheKey} from "./workspace-cache-state";
import {WorkspaceCacheContext,WorkspaceRefreshingContext} from "./workspace-cache-context";
const day=()=>new Date().toLocaleDateString("en-CA");
export function WorkspaceCacheProvider({accountId,children}:{accountId:string;children:ReactNode}) {
 const cache=useMemo(()=>new WorkspaceCache<ReactNode>(accountId),[accountId]);
 const [revision,setRevision]=useState(0);
 const remember=useCallback((key:string,value:ReactNode)=>cache.remember(key,day(),value),[cache]);
 const read=useCallback((key:string)=>cache.read(key,day()),[cache]);
 useEffect(()=>{const invalidate=()=>{cache.clear();setRevision(value=>value+1);};const events=["formward-record-saved","formward-record-context-stale","formward-load-latest"];for(const event of events)window.addEventListener(event,invalidate);return()=>{for(const event of events)window.removeEventListener(event,invalidate);cache.clear();};},[cache]);
 return <WorkspaceCacheContext value={{read,remember,revision}}>{children}</WorkspaceCacheContext>;
}
/** query 由服务端读取时固定，迟到的旧路由响应不能注册到新日期键下。 */
export function WorkspaceSnapshot({path,query="",children}:{path:string;query?:string;children:ReactNode}) {
 const cache=useContext(WorkspaceCacheContext),remember=cache?.remember,key=workspaceCacheKey(path,query);
 useLayoutEffect(()=>{remember?.(key,children);},[remember,key,children]);
 return children;
}
export function WorkspacePending({children,failed=false}:{children:ReactNode;failed?:boolean}) {
 const cache=useContext(WorkspaceCacheContext),path=usePathname(),query=useSearchParams().toString();
 const content=cache?.read(workspaceCacheKey(path,query));
 return content?<WorkspaceRefreshingContext value><div className="workspace-refresh" aria-busy={!failed} data-workspace-cached>{failed?children:<div className="workspace-refresh-status"><LocalLoading label="正在更新…"/></div>}<fieldset disabled className="workspace-retained">{content}</fieldset></div></WorkspaceRefreshingContext>:children;
}
