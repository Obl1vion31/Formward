import { AssistantPage } from "@/features/assistant/assistant-page";
import { requirePageUser } from "@/features/auth/server";

export default async function Page() {
  await requirePageUser();
  return <AssistantPage fromWorkspace/>;
}
