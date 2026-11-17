import {headers} from "next/headers";
import {AdminLoading} from "@/features/admin/loading";
export default async function Loading(){return <AdminLoading path={(await headers()).get("x-formward-web-path")??"/admin/users/pending"}/>;}
