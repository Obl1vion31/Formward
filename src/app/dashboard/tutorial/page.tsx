import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { TutorialView } from "@/features/onboarding/tutorial-view";
export const metadata:Metadata={title:"Formward · 使用说明",robots:{index:false,follow:false}};
export default async function TutorialPage(){
  const user=await currentPageUser();if(!user)redirect("/");
  return <div className="dashboard-page tutorial-page"><TutorialView/></div>;
}
