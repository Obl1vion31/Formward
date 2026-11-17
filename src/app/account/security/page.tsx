import { MfaPanel } from "@/features/auth/mfa-panel";
import {ConfirmationProvider} from "@/components/confirmation";
export const metadata = { title: "Formward · 身份验证", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ challenge?: string; returnTo?: string }> }) {
  const query = await searchParams;
  return <ConfirmationProvider><main className="security-page"><MfaPanel challenge={query.challenge === "1"} returnTo={query.returnTo} /></main></ConfirmationProvider>;
}
