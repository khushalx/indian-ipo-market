export type CurrencyUnit = "rupees" | "crore" | "lakh";
export type DateFormat = "short" | "medium" | "long" | "numeric";
export type GMPDirection = "positive" | "negative" | "neutral";

const indianNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const dateFormats: Record<DateFormat, Intl.DateTimeFormatOptions> = {
  short: { day: "numeric", month: "short" },
  medium: { day: "numeric", month: "short", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
};

/** Formats a rupee amount with Indian digit grouping. */
export function formatIndianCurrency(value: number | null | undefined, unit: CurrencyUnit = "rupees"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (unit === "crore") return formatCrore(value);
  if (unit === "lakh") return `₹${indianNumber.format(value)} L`;
  return `₹${indianNumber.format(value)}`;
}

export function formatCrore(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value)} Cr`;
}

export function formatPercent(value: number | null | undefined, options: { sign?: boolean; maximumFractionDigits?: number } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const { sign = false, maximumFractionDigits = 1 } = options;
  const prefix = sign && value > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value)}%`;
}

export function formatDate(value: string | Date | null | undefined, format: DateFormat = "medium"): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(`${value}`.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", dateFormats[format]).format(date);
}

export function formatSubscription(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`;
}

export function formatGMP(value: number | null | undefined, percent?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return percent === null || percent === undefined
    ? signedRupees(value)
    : `${signedRupees(value)} (${signedPercent(percent)})`;
}

export function gmpDirection(value: number): GMPDirection {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export function calculateGMPPercent(value?: number, upperPriceBand?: number): number | undefined {
  if (value == null || upperPriceBand == null || upperPriceBand <= 0) return undefined;
  return (value / upperPriceBand) * 100;
}

export function formatMarketValue(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: maximumFractionDigits, maximumFractionDigits }).format(value);
}

export function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${indianNumber.format(value)}${suffix}`;
}

export const formatRupees = (value: number | null | undefined) => formatIndianCurrency(value);
export const formatMultiple = (value: number | null | undefined) => formatSubscription(value);

export function formatPriceBand(min?: number | null, max?: number | null): string {
  if (min == null || max == null) return "Not announced";
  return `${formatIndianCurrency(min)}–${formatIndianCurrency(max).replace("₹", "")}`;
}

export function formatBoard(value: string): string {
  if (value === "sme") return "SME";
  if (value === "mainboard") return "Mainboard";
  return "Board not verified";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  }).format(date);
}

/** A stable, compact IST timestamp for dense market-data surfaces. */
export function formatCompactDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function signedRupees(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatIndianCurrency(Math.abs(value))}`;
}

export function signedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${indianNumber.format(Math.abs(value))}%`;
}

export function formatExchange(value: string): string {
  return value.replaceAll("_", " ");
}

export function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
