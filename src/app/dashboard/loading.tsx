"use client";
import {usePathname} from "next/navigation";
import {TrainingSkeleton} from "@/features/training/loading";
import {WorkspaceLoading} from "@/components/workspace-loading";


/** 总览的加载边界可独立预取；子页面使用各自的边界，次级页只提供局部反馈。 */
export default function Loading(){
 const path=usePathname();
 if(path.startsWith("/dashboard/training"))return <TrainingSkeleton/>;
 const kind=path==="/dashboard"?"overview":path.startsWith("/dashboard/meals")?"nutrition":path.startsWith("/dashboard/measurements")?"body":path.startsWith("/dashboard/energy")?"energy":null;
 return kind?<WorkspaceLoading kind={kind}/>:<main className="dashboard-page" aria-busy="true"/>;
}
