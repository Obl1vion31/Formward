import { notFound, redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { getMealOperation, displayMealOperation, readMealSnapshot } from "@/features/meals/records";
import { MealReview } from "@/features/meals/meal-review";
import { ApiError } from "@/features/auth/ai-identity";
import { DashboardHeader } from "../../../header";
import { decideMealAction, refreshMealAction, editMealPreviewAction, loadMealReviewAction } from "../../actions";
export const metadata={title:"Formward · 确认饮食记录",referrer:"no-referrer" as const};
export const maxDuration = 60;
export default async function ReviewPage({params}:{params:Promise<{id:string}>}) {
 const user=await currentPageUser(); if(!user) redirect("/");
 const db=getDatabase(); let row;
 try {row=await getMealOperation(db,user.id,(await params).id);} catch(e) {if(e instanceof ApiError&&e.status===404) notFound(); throw e;}
 const snapshot=await readMealSnapshot(db,user.id);
 return <main className="dashboard-page"><DashboardHeader email={user.email}/><MealReview operation={displayMealOperation(row)} foods={snapshot.foods} decide={decideMealAction} refresh={refreshMealAction} edit={editMealPreviewAction} load={loadMealReviewAction}/></main>;
}
