"use client";

import { Calculator, Minus, Plus, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { formatIndianCurrency, formatPercent } from "@/lib/format";
import type { IPO } from "@/types";
import styles from "./ipo-calculator.module.css";

interface IPOCalculatorProps {
  ipo: IPO;
  onClose?: () => void;
}

export function IPOCalculator({ ipo, onClose }: IPOCalculatorProps) {
  const defaultLotSize = ipo.lotSize ?? 100;
  const defaultPrice = ipo.priceBandMax ?? ipo.priceBandMin ?? 100;
  const defaultGmp = ipo.gmp ?? 0;

  const [lots, setLots] = useState(1);
  const [customPrice, setCustomPrice] = useState<number>(defaultPrice);
  const [customGmp, setCustomGmp] = useState<number>(defaultGmp);

  const totalShares = lots * defaultLotSize;
  const totalInvestment = totalShares * customPrice;
  const estimatedListingPrice = customPrice + customGmp;
  const profitPerLot = defaultLotSize * customGmp;
  const totalEstimatedProfit = lots * profitPerLot;
  const roiPercent = totalInvestment > 0 ? (totalEstimatedProfit / totalInvestment) * 100 : 0;

  const handleLotsChange = (delta: number) => {
    setLots((current) => Math.max(1, Math.min(100, current + delta)));
  };

  return (
    <div className={styles.calculatorCard}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.iconWrap}>
            <Calculator size={18} aria-hidden="true" />
          </div>
          <div>
            <h3>IPO Profit & Returns Calculator</h3>
            <p>{ipo.company.name} ({ipo.type === "sme" ? "SME" : "Mainboard"})</p>
          </div>
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close calculator">
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.controlsGrid}>
          {/* Number of Lots */}
          <div className={styles.controlGroup}>
            <label id="lots-label">Number of Lots</label>
            <div className={styles.stepper} role="group" aria-labelledby="lots-label">
              <button
                type="button"
                onClick={() => handleLotsChange(-1)}
                disabled={lots <= 1}
                aria-label="Decrease lots"
              >
                <Minus size={14} />
              </button>
              <span className={styles.stepperValue}>{lots} {lots === 1 ? "Lot" : "Lots"}</span>
              <button
                type="button"
                onClick={() => handleLotsChange(1)}
                disabled={lots >= 100}
                aria-label="Increase lots"
              >
                <Plus size={14} />
              </button>
            </div>
            <small className={styles.helpText}>{totalShares.toLocaleString("en-IN")} total shares ({defaultLotSize} shares/lot)</small>
          </div>

          {/* Issue Price */}
          <div className={styles.controlGroup}>
            <label htmlFor="calc-price">Cutoff / Bid Price (₹)</label>
            <input
              id="calc-price"
              type="number"
              value={customPrice}
              onChange={(e) => setCustomPrice(Math.max(1, Number(e.target.value) || 0))}
              className={styles.input}
              min="1"
            />
            <small className={styles.helpText}>Price band: {formatIndianCurrency(ipo.priceBandMin)}–{formatIndianCurrency(ipo.priceBandMax).replace("₹", "")}</small>
          </div>

          {/* GMP */}
          <div className={styles.controlGroup}>
            <label htmlFor="calc-gmp">Expected GMP (₹)</label>
            <input
              id="calc-gmp"
              type="number"
              value={customGmp}
              onChange={(e) => setCustomGmp(Number(e.target.value) || 0)}
              className={styles.input}
            />
            <small className={styles.helpText}>Live reported GMP: {ipo.gmp != null ? formatIndianCurrency(ipo.gmp) : "No GMP reported"}</small>
          </div>
        </div>

        {/* Results Banner */}
        <div className={styles.resultsGrid}>
          <div className={styles.resultItem}>
            <span className={styles.resultLabel}>Total Investment</span>
            <strong className={styles.resultValue}>{formatIndianCurrency(totalInvestment)}</strong>
            <small className={styles.resultSub}>{lots} lot application</small>
          </div>

          <div className={styles.resultItem}>
            <span className={styles.resultLabel}>Est. Listing Price</span>
            <strong className={styles.resultValue}>{formatIndianCurrency(estimatedListingPrice)}</strong>
            <small className={styles.resultSub}>{formatIndianCurrency(customPrice)} + {formatIndianCurrency(customGmp)}</small>
          </div>

          <div className={`${styles.resultItem} ${totalEstimatedProfit >= 0 ? styles.gainItem : styles.lossItem}`}>
            <span className={styles.resultLabel}>Estimated Gain / Return</span>
            <strong className={styles.resultValue}>
              {totalEstimatedProfit >= 0 ? "+" : "−"}{formatIndianCurrency(Math.abs(totalEstimatedProfit))}
            </strong>
            <span className={styles.roiBadge}>
              <TrendingUp size={12} aria-hidden="true" />
              {formatPercent(roiPercent, { sign: true, maximumFractionDigits: 1 })} ROI
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
