import { BaseError, formatUnits } from "viem";
export const shortAddress = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export function amount(value: bigint | undefined, decimals = 18, digits = 4) {
  if (value === undefined) return "—";
  const full = formatUnits(value, decimals);
  const [whole, fraction = ""] = full.split(".");
  const rounded = fraction.slice(0, digits).replace(/0+$/, "");
  if (whole === "0" && !rounded && value > 0n)
    return `<0.${"0".repeat(digits - 1)}1`;
  return `${BigInt(whole).toLocaleString("en-US")}${rounded ? `.${rounded}` : ""}`;
}
export const exactAmount = (value: bigint, decimals = 18) =>
  formatUnits(value, decimals);
export function errorMessage(error: unknown): string {
  const text =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : String(error);
  if (/rejected|denied|4001/i.test(text))
    return "Request cancelled in your wallet. Nothing was submitted.";
  if (/insufficient funds/i.test(text))
    return "Not enough Sepolia ETH for gas. Add testnet ETH, then prepare again.";
  if (
    /failed to fetch|network|timeout|timed out|http request|socket|fetch failed/i.test(
      text,
    )
  )
    return "The Sepolia RPC could not complete this read. Retry or choose another RPC in Network & contracts.";
  return text.length > 700 ? text.slice(0, 700) : text;
}
