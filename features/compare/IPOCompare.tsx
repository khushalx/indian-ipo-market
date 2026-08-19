"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { formatCrore, formatIndianCurrency, formatMultiple, formatPercent } from "@/lib/format";
import type { IPO, IPOFinancial } from "@/types";
import styles from "./compare.module.css";

interface IPOCompareProps {
  ipos: IPO[];
  financials: IPOFinancial[];
  defaultSelection?: string[];
}

interface FinancialSnapshot {
  first?: IPOFinancial;
  latest?: IPOFinancial;
  revenueCagr?: number;
}

interface MetricRow {
  label: string;
  note?: string;
  value: (ipo: IPO, financial?: FinancialSnapshot) => ReactNode;
}

interface MetricSection {
  label: string;
  rows: MetricRow[];
}

function money(value: number | undefined) {
  return value == null ? null : formatCrore(value);
}

function percent(value: number | undefined) {
  return value == null ? null : formatPercent(value, { maximumFractionDigits: 1 });
}

function multiple(value: number | undefined) {
  return value == null ? null : formatMultiple(value);
}

function MissingValue() {
  return <span className={styles.missing} aria-label="Not available">—</span>;
}

function Value({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === "" ? <MissingValue /> : <>{children}</>;
}

function fiscalYearNumber(value: IPOFinancial["fiscalYear"]) {
  return Number(value.replace("FY", ""));
}

function getFinancialSnapshot(rows: IPOFinancial[]): FinancialSnapshot {
  const ordered = [...rows].sort((a, b) => fiscalYearNumber(a.fiscalYear) - fiscalYearNumber(b.fiscalYear));
  const first = ordered.find((row) => row.revenueCr !== undefined);
  const latest = [...ordered].reverse().find((row) => row.revenueCr !== undefined) ?? ordered.at(-1);
  let revenueCagr: number | undefined;

  if (first?.revenueCr && latest?.revenueCr) {
    const years = fiscalYearNumber(latest.fiscalYear) - fiscalYearNumber(first.fiscalYear);
    if (years > 0) revenueCagr = (Math.pow(latest.revenueCr / first.revenueCr, 1 / years) - 1) * 100;
  }

  return { first, latest, revenueCagr };
}

function formatType(ipo: IPO) {
  return ipo.type === "sme" ? "SME" : "Mainboard";
}

function formatStatus(ipo: IPO) {
  return ipo.status.charAt(0).toUpperCase() + ipo.status.slice(1);
}

const metricSections: MetricSection[] = [
  {
    label: "Offer details",
    rows: [
      { label: "Type", value: (ipo) => formatType(ipo) },
      { label: "Price band", value: (ipo) => `${formatIndianCurrency(ipo.priceBandMin)}–${formatIndianCurrency(ipo.priceBandMax).replace("₹", "")}` },
      { label: "Issue size", note: "Total offer", value: (ipo) => money(ipo.issueSizeCr) },
      { label: "Fresh issue", note: "Capital to company", value: (ipo) => money(ipo.freshIssueCr) },
      { label: "Offer for sale", note: "Proceeds to sellers", value: (ipo) => ipo.offerForSaleCr === 0 ? "None" : money(ipo.offerForSaleCr) },
    ],
  },
  {
    label: "Demand indicators",
    rows: [
      {
        label: "GMP",
        note: "Unregulated market",
        value: (ipo) => {
          if (ipo.gmp === undefined) return null;
          const gmpPercent = (ipo.gmp / ipo.priceBandMax) * 100;
          return (
            <span className={ipo.gmp >= 0 ? styles.positive : styles.negative}>
              {ipo.gmp >= 0 ? "+" : "−"}{formatIndianCurrency(Math.abs(ipo.gmp))}
              <small>{ipo.gmp >= 0 ? "+" : "−"}{formatPercent(Math.abs(gmpPercent), { maximumFractionDigits: 1 })}</small>
            </span>
          );
        },
      },
      { label: "Subscription", note: "Total booked", value: (ipo) => multiple(ipo.subscriptionTotal) },
    ],
  },
  {
    label: "Financial performance",
    rows: [
      {
        label: "Revenue",
        note: "Latest fiscal year",
        value: (_ipo, financial) => money(financial?.latest?.revenueCr),
      },
      {
        label: "Revenue CAGR",
        note: "Earliest to latest FY",
        value: (_ipo, financial) => percent(financial?.revenueCagr),
      },
      { label: "PAT", note: "Latest fiscal year", value: (_ipo, financial) => money(financial?.latest?.patCr) },
      { label: "ROE", value: (_ipo, financial) => percent(financial?.latest?.roePercent) },
      { label: "ROCE", value: (_ipo, financial) => percent(financial?.latest?.rocePercent) },
      { label: "Debt / equity", value: (_ipo, financial) => multiple(financial?.latest?.debtToEquity) },
    ],
  },
  {
    label: "Valuation",
    rows: [
      { label: "P / E", note: "At upper band", value: (ipo) => multiple(ipo.ipoPE) },
      { label: "Industry P / E", value: (ipo) => multiple(ipo.industryPE) },
    ],
  },
  {
    label: "Shareholding",
    rows: [
      { label: "Promoter holding", note: "Pre-issue", value: (ipo) => percent(ipo.preIssuePromoterHolding) },
      { label: "Promoter holding", note: "Post-issue", value: (ipo) => percent(ipo.postIssuePromoterHolding) },
    ],
  },
];

export default function IPOCompare({ ipos, financials, defaultSelection = [] }: IPOCompareProps) {
  const fallbackSelection = ipos.filter((ipo) => ipo.status === "open").slice(0, 2).map((ipo) => ipo.id);
  const [selectedIds, setSelectedIds] = useState(() =>
    (defaultSelection.length ? defaultSelection : fallbackSelection).filter((id) => ipos.some((ipo) => ipo.id === id)).slice(0, 3),
  );

  const ipoById = useMemo(() => new Map(ipos.map((ipo) => [ipo.id, ipo])), [ipos]);
  const selectedIPOs = selectedIds.map((id) => ipoById.get(id)).filter((ipo): ipo is IPO => Boolean(ipo));

  const financialByIPO = useMemo(() => {
    const grouped = new Map<string, IPOFinancial[]>();
    financials.forEach((row) => grouped.set(row.ipoId, [...(grouped.get(row.ipoId) ?? []), row]));
    return new Map([...grouped.entries()].map(([ipoId, rows]) => [ipoId, getFinancialSnapshot(rows)]));
  }, [financials]);

  const setSlot = (slot: number, value: string) => {
    setSelectedIds((current) => {
      const next = [...current];
      if (!value) next.splice(slot, 1);
      else next[slot] = value;
      return next.filter((id, index, all) => id && all.indexOf(id) === index).slice(0, 3);
    });
  };

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>SIDE-BY-SIDE ANALYSIS</p>
          <h1>Compare IPOs</h1>
          <p className={styles.lede}>Put issue structure, demand, financial quality and valuation on the same footing.</p>
        </div>
        <div className={styles.introMeta}>
          <div className={styles.dataNote}><span aria-hidden="true" />Development data · Not live</div>
          <div className={styles.limitNote}><strong>{selectedIPOs.length}</strong> / 3 selected</div>
        </div>
      </header>

      <section className={styles.selectorSection} aria-labelledby="choose-ipos">
        <div className={styles.selectorHeading}>
          <div>
            <p>BUILD COMPARISON</p>
            <h2 id="choose-ipos">Choose up to three IPOs</h2>
          </div>
          <span>All figures in ₹ crore unless noted</span>
        </div>

        <div className={styles.selectors}>
          {[0, 1, 2].map((slot) => {
            const selected = ipoById.get(selectedIds[slot]);
            return (
              <div className={`${styles.selector} ${selected ? styles.selectorFilled : ""}`} key={slot}>
                <label htmlFor={`ipo-slot-${slot}`}>{selected ? `IPO ${String(slot + 1).padStart(2, "0")}` : "Add IPO"}</label>
                <div className={styles.selectControl}>
                  {!selected && <Plus size={15} aria-hidden="true" />}
                  <select
                    id={`ipo-slot-${slot}`}
                    value={selected?.id ?? ""}
                    onChange={(event) => setSlot(slot, event.target.value)}
                    aria-label={`${selected ? "Change" : "Select"} IPO ${slot + 1}`}
                  >
                    <option value="">Select an IPO</option>
                    {ipos.map((ipo) => (
                      <option key={ipo.id} value={ipo.id} disabled={selectedIds.includes(ipo.id) && ipo.id !== selected?.id}>
                        {ipo.company.name} · {formatType(ipo)}
                      </option>
                    ))}
                  </select>
                  {selected && (
                    <button type="button" onClick={() => setSlot(slot, "")} aria-label={`Remove ${selected.company.name}`}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <p>{selected ? `${formatStatus(selected)} · ${selected.company.industry}` : "Search the complete IPO directory"}</p>
              </div>
            );
          })}
        </div>
      </section>

      {selectedIPOs.length ? (
        <section className={styles.comparisonSection} aria-labelledby="comparison-heading">
          <div className={styles.tableHeading}>
            <div>
              <p>COMPARISON</p>
              <h2 id="comparison-heading">Key IPO metrics</h2>
            </div>
            <p><span aria-hidden="true">—</span> Not available in filed data</p>
          </div>

          <div className={styles.tableFrame}>
            <table className={styles.compareTable}>
              <caption className={styles.srOnly}>Comparison of selected IPO metrics</caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {selectedIPOs.map((ipo) => (
                    <th scope="col" key={ipo.id}>
                      <strong>{ipo.company.name}</strong>
                      <span>{formatType(ipo)} · {ipo.company.industry}</span>
                      <small>{ipo.source.sourceName}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricSections.map((section) => (
                  <ComparisonSection
                    key={section.label}
                    section={section}
                    ipos={selectedIPOs}
                    financialByIPO={financialByIPO}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <footer className={styles.methodNote}>
            A dash indicates that a value is not available in filed data. Financial metrics use each company&apos;s latest available fiscal year. Revenue CAGR is calculated from the earliest to latest available annual revenue. GMP is unofficial and can change without notice.
          </footer>
        </section>
      ) : (
        <section className={styles.emptyState} aria-live="polite">
          <Plus size={20} aria-hidden="true" />
          <h2>Select an IPO to begin</h2>
          <p>You can compare up to three issues at once.</p>
        </section>
      )}
    </main>
  );
}

function ComparisonSection({
  section,
  ipos,
  financialByIPO,
}: {
  section: MetricSection;
  ipos: IPO[];
  financialByIPO: Map<string, FinancialSnapshot>;
}) {
  return (
    <>
      <tr className={styles.groupRow}>
        <th colSpan={ipos.length + 1} scope="colgroup">{section.label}</th>
      </tr>
      {section.rows.map((row) => (
        <tr key={`${section.label}-${row.label}-${row.note ?? ""}`}>
          <th scope="row">
            {row.label}
            {row.note && <small>{row.note}</small>}
          </th>
          {ipos.map((ipo) => (
            <td key={ipo.id}>
              <Value>{row.value(ipo, financialByIPO.get(ipo.id))}</Value>
              {section.label === "Financial performance" && financialByIPO.get(ipo.id)?.latest && (
                <span className={styles.period}>{financialByIPO.get(ipo.id)?.latest?.fiscalYear}</span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
