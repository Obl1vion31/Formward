import { regionConfig } from "@/features/auth/regions";
import { RegionSelector } from "./selector";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function RegionPage() {
  const config = regionConfig();
  if (config.enabled && config.singleWeb) redirect(config.cn);
  return <RegionSelector cn={config.cn} global={config.global} />;
}
