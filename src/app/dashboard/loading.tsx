"use client";
import {usePathname} from "next/navigation";
import {WorkspaceSkeleton} from "@/components/workspace-skeleton";
import {LocalLoading} from "@/components/local-loading";

/** 总览的加载边界可独立预取；子页面使用各自的边界，次级页只提供局部反馈。 */
export default function Loading(){
 const path=usePathname();
 return path==="/dashboard"?<WorkspaceSkeleton kind="overview"/>:<LocalLoading active label="正在读取…"/>;
}
