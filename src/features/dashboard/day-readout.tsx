import { formatIntegerNumber } from "@/components/number-format";
import { balanceLabel } from "./day-readings";

export function BalanceReading({ balance }: { balance: number | null }) {
  const label = balanceLabel(balance);
  if (balance === null || balance === 0) return label;
  return <>{label} <span><b>{formatIntegerNumber(Math.abs(balance))}</b> <small>千卡</small></span></>;
}
