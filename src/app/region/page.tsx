import { regionConfig } from "@/features/auth/regions";
import { RegionSelector } from "./selector";
export const dynamic = "force-dynamic";
export default function RegionPage() {
  const config = regionConfig();
  return <RegionSelector cn={config.cn} global={config.global} />;
}
