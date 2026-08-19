"use client";

import {
  calculateGMPPercent,
  formatCompactDateTime,
  formatNumber,
  gmpDirection,
  signedPercent,
  signedRupees,
} from "@/lib/format";
import styles from "./gmp-quote.module.css";

type GMPQuoteProps = {
  value?: number;
  upperPriceBand?: number;
  updatedAt?: string;
};

function spokenSignedValue(value: number, unit: "rupees" | "percent"): string {
  const sign = value > 0 ? "plus " : value < 0 ? "minus " : "";
  const amount = value === 0 ? "zero" : formatNumber(Math.abs(value));
  return `${sign}${amount} ${unit}`;
}

export function GMPQuote({ value, upperPriceBand, updatedAt }: GMPQuoteProps) {
  if (value == null || Number.isNaN(value)) {
    return <span className={styles.unavailable} aria-label="GMP not available">—</span>;
  }

  const direction = gmpDirection(value);
  const tone = styles[direction];
  const rawPercent = calculateGMPPercent(value, upperPriceBand);
  const percent = rawPercent == null ? undefined : Number(rawPercent.toFixed(1));

  return (
    <span className={styles.quote}>
      <strong
        className={`${styles.amount} ${tone}`}
        aria-label={`Grey market premium: ${spokenSignedValue(value, "rupees")}`}
      >
        {signedRupees(value)}
      </strong>
      <small className={styles.meta}>
        {percent != null ? (
          <>
            <span
              className={tone}
              aria-label={`Grey market premium percentage: ${spokenSignedValue(percent, "percent")}`}
            >
              {signedPercent(percent)}
            </span>
            <span aria-hidden="true"> · </span>
          </>
        ) : null}
        {updatedAt ? (
          <time className={styles.timestamp} dateTime={updatedAt}>
            Updated {formatCompactDateTime(updatedAt)}
          </time>
        ) : (
          <span className={styles.timestamp}>Update time unavailable</span>
        )}
      </small>
    </span>
  );
}
