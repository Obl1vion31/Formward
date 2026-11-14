"use client";
import {createContext,type ReactNode} from "react";
export const WorkspaceCacheContext=createContext<{read:(key:string)=>ReactNode;remember:(key:string,value:ReactNode)=>void;revision:number}|null>(null);
export const WorkspaceRefreshingContext=createContext(false);
