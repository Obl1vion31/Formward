import { notFound } from "next/navigation";
import { MaterialReview } from "@/features/dashboard/material-review";
export const metadata={title:"Formward · 材质对照"};
export default function VisualReviewPage(){if(process.env.FORMWARD_VISUAL_REVIEW!=="1")notFound();return <MaterialReview/>;}
