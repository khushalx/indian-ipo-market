import type { CSSProperties } from "react";
import type {
  IPO,
  IPOFinancial,
  IPOGMPRecord,
  IPOPeer,
  IPOSubscription,
} from "@/types";
import { EmptyState, Metric, SectionHeading, SourceLine } from "./DetailPrimitives";
import {
  formatCrore,
  formatDate,
  formatDateTime,
  formatMultiple,
  formatPercent,
  formatRupees,
  signedPercent,
  signedRupees,
} from "./format";
import styles from "./ipo-detail.module.css";

type DetailDataProps = {
  ipo: IPO;
  gmpHistory: IPOGMPRecord[];
  subscriptions: IPOSubscription[];
  financials: IPOFinancial[];
  peers: IPOPeer[];
};

const sortByDate = <T extends { date: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.date.localeCompare(b.date));

function GMPChart({ records }: { records: IPOGMPRecord[] }) {
  const points = sortByDate(records);
  if (points.length < 2) {
    return (
      <EmptyState title="History is still forming">
        A trend line will appear after at least two verified observations are available.
      </EmptyState>
    );
  }

  const width = 760;
  const height = 224;
  const insetX = 42;
  const insetY = 24;
  const values = points.map((record) => record.gmp);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const range = Math.max(rawMax - rawMin, 10);
  const min = rawMin - range * 0.14;
  const max = rawMax + range * 0.14;
  const x = (index: number) =>
    insetX + (index / Math.max(points.length - 1, 1)) * (width - insetX * 2);
  const y = (value: number) =>
    insetY + ((max - value) / (max - min)) * (height - insetY * 2);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.gmp)}`)
    .join(" ");

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.gmpChart}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="gmp-chart-title gmp-chart-description"
      >
        <title id="gmp-chart-title">Grey market premium history</title>
        <desc id="gmp-chart-description">
          GMP observations from {formatDate(points[0].date)} to{" "}
          {formatDate(points.at(-1)?.date)}.
        </desc>
        {[0, 0.5, 1].map((step) => {
          const lineY = insetY + step * (height - insetY * 2);
          const labelValue = max - step * (max - min);
          return (
            <g key={step}>
              <line
                className={styles.chartGrid}
                x1={insetX}
                x2={width - insetX}
                y1={lineY}
                y2={lineY}
              />
              <text className={styles.chartAxisLabel} x="0" y={lineY + 4}>
                ₹{Math.round(labelValue)}
              </text>
            </g>
          );
        })}
        <path className={styles.chartLine} d={path} />
        {points.map((point, index) => (
          <g key={point.id}>
            <circle
              className={styles.chartPoint}
              cx={x(index)}
              cy={y(point.gmp)}
              r={index === points.length - 1 ? 4.5 : 3}
            />
            {(index === 0 || index === points.length - 1) && (
              <text
                className={styles.chartDateLabel}
                textAnchor={index === 0 ? "start" : "end"}
                x={x(index)}
                y={height - 2}
              >
                {formatDate(point.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function GMPSection({ ipo, gmpHistory }: Pick<DetailDataProps, "ipo" | "gmpHistory">) {
  const records = sortByDate(gmpHistory);
  const currentRecord = records.at(-1);
  const current = currentRecord?.gmp ?? ipo.gmp;
  const currentPercent =
    currentRecord?.gmpPercent ??
    (current == null || !ipo.priceBandMax ? undefined : (current / ipo.priceBandMax) * 100);
  const estimated =
    currentRecord?.estimatedListingPrice ??
    ipo.estimatedListingPrice ??
    (current == null || ipo.priceBandMax == null ? undefined : ipo.priceBandMax + current);
  const values = records.map((record) => record.gmp);
  const first = records[0]?.gmp;
  const change = current == null || first == null ? undefined : current - first;

  return (
    <section id="gmp" className={styles.section}>
      <SectionHeading
        eyebrow="Unofficial grey market data"
        title="Grey Market Premium"
        description="A directional view of informal pre-listing market activity—not an exchange-traded price."
        aside={<SourceLine source={currentRecord?.source} updatedAt={ipo.gmpUpdatedAt} compact />}
      />

      {current == null ? (
        <EmptyState title="GMP is not available">
          No reliable grey market observation has been reported for this issue yet.
        </EmptyState>
      ) : (
        <>
          <dl className={styles.gmpSummary}>
            <Metric label="Current GMP" value={signedRupees(current)} detail={signedPercent(currentPercent)} accent />
            <Metric label="Estimated listing" value={formatRupees(estimated)} detail="Upper band + current GMP" />
            <Metric label="Observed high" value={signedRupees(values.length ? Math.max(...values) : current)} />
            <Metric label="Observed low" value={signedRupees(values.length ? Math.min(...values) : current)} />
            <Metric label="Since first quote" value={signedRupees(change)} detail={first == null ? "Not enough history" : `First quote ${signedRupees(first)}`} />
            <Metric label="Last updated" value={formatDateTime(ipo.gmpUpdatedAt ?? currentRecord?.date)} />
          </dl>
          <GMPChart records={records} />
        </>
      )}

      <p className={styles.dataNote}>
        GMP is unofficial, unregulated market information and may be volatile. It does not guarantee the listing price or future performance.
      </p>
    </section>
  );
}

const subscriptionCategories: Array<{
  key: keyof Pick<
    IPOSubscription,
    "qib" | "nii" | "bnii" | "snii" | "retail" | "employee" | "shareholder" | "total"
  >;
  label: string;
  detail: string;
}> = [
  { key: "qib", label: "QIB", detail: "Qualified institutional buyers" },
  { key: "nii", label: "NII", detail: "Non-institutional investors" },
  { key: "bnii", label: "bNII", detail: "Applications above ₹10 lakh" },
  { key: "snii", label: "sNII", detail: "Applications up to ₹10 lakh" },
  { key: "retail", label: "Retail", detail: "Retail individual investors" },
  { key: "employee", label: "Employee", detail: "Eligible employees" },
  { key: "shareholder", label: "Shareholder", detail: "Eligible shareholders" },
  { key: "total", label: "Total", detail: "All investor categories" },
];

export function SubscriptionSection({ subscriptions }: Pick<DetailDataProps, "subscriptions">) {
  const days = [...subscriptions].sort((a, b) => a.day - b.day);
  const categories = subscriptionCategories.filter(
    ({ key }) => key === "total" || days.some((day) => day[key] != null),
  );
  const latest = days.at(-1);

  return (
    <section id="subscription" className={styles.section}>
      <SectionHeading
        eyebrow="Demand"
        title="Subscription"
        description="Cumulative bids received against shares reserved for each investor category."
        aside={<SourceLine source={latest?.source} updatedAt={latest?.asOfDate} compact />}
      />
      {!days.length ? (
        <EmptyState title="Subscription data is not available">
          Category-wise bidding will appear after the exchange begins publishing bid updates.
        </EmptyState>
      ) : (
        <div className={styles.tableScroller}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">Investor category</th>
                {days.map((day) => (
                  <th scope="col" key={day.id}>
                    Day {day.day}
                    <small>{formatDate(day.asOfDate)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr className={category.key === "total" ? styles.totalRow : ""} key={category.key}>
                  <th scope="row">
                    {category.label}
                    <small>{category.detail}</small>
                  </th>
                  {days.map((day) => (
                    <td key={day.id}>{formatMultiple(day[category.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type FinancialRow = {
  label: string;
  key: keyof IPOFinancial;
  format: (value?: number) => string;
};

const financialRows: FinancialRow[] = [
  { label: "Revenue", key: "revenueCr", format: formatCrore },
  { label: "Revenue growth", key: "revenueGrowthPercent", format: formatPercent },
  { label: "EBITDA", key: "ebitdaCr", format: formatCrore },
  { label: "EBITDA margin", key: "ebitdaMarginPercent", format: formatPercent },
  { label: "Profit after tax", key: "patCr", format: formatCrore },
  { label: "PAT margin", key: "patMarginPercent", format: formatPercent },
  { label: "Total assets", key: "totalAssetsCr", format: formatCrore },
  { label: "Net worth", key: "netWorthCr", format: formatCrore },
  { label: "Total debt", key: "totalDebtCr", format: formatCrore },
  { label: "Operating cash flow", key: "operatingCashFlowCr", format: formatCrore },
];

const yearOrder = ["FY22", "FY23", "FY24", "FY25"];

function FinancialBars({ financials }: { financials: IPOFinancial[] }) {
  const max = Math.max(
    ...financials.flatMap((year) => [year.revenueCr ?? 0, Math.abs(year.patCr ?? 0)]),
    1,
  );

  return (
    <div className={styles.financialBars} aria-label="Revenue and profit after tax comparison">
      <div className={styles.barLegend}>
        <span><i className={styles.revenueKey} />Revenue</span>
        <span><i className={styles.patKey} />PAT</span>
      </div>
      {financials.map((year) => (
        <div className={styles.barYear} key={year.id}>
          <strong>{year.fiscalYear}</strong>
          <div>
            <span
              className={styles.revenueBar}
              style={{ width: `${Math.max(((year.revenueCr ?? 0) / max) * 100, 1)}%` }}
              title={`Revenue ${formatCrore(year.revenueCr)}`}
            />
            <span
              className={styles.patBar}
              style={{ width: `${Math.max((Math.abs(year.patCr ?? 0) / max) * 100, 1)}%` }}
              title={`PAT ${formatCrore(year.patCr)}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FinancialsSection({ financials }: Pick<DetailDataProps, "financials">) {
  const years = [...financials].sort(
    (a, b) => yearOrder.indexOf(a.fiscalYear) - yearOrder.indexOf(b.fiscalYear),
  );
  const latest = years.at(-1);

  return (
    <section id="financials" className={styles.section}>
      <SectionHeading
        eyebrow="Historical performance"
        title="Financials"
        description="Restated consolidated figures from offer documents, shown in ₹ crore unless noted."
        aside={<SourceLine source={latest?.source} compact />}
      />
      {!years.length ? (
        <EmptyState title="Financial history is not available">
          Restated financial statements have not been added by the provider.
        </EmptyState>
      ) : (
        <>
          <div className={styles.tableScroller}>
            <table className={`${styles.dataTable} ${styles.financialTable}`}>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {years.map((year) => <th scope="col" key={year.id}>{year.fiscalYear}</th>)}
                </tr>
              </thead>
              <tbody>
                {financialRows.map((row) => (
                  <tr key={String(row.key)}>
                    <th scope="row">{row.label}</th>
                    {years.map((year) => {
                      const value = year[row.key];
                      return (
                        <td key={year.id}>
                          {typeof value === "number" ? row.format(value) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.financialLower}>
            <FinancialBars financials={years} />
            <div>
              <h3>Key ratios <small>{latest?.fiscalYear}</small></h3>
              <dl className={styles.ratioGrid}>
                <Metric label="ROE" value={formatPercent(latest?.roePercent)} />
                <Metric label="ROCE" value={formatPercent(latest?.rocePercent)} />
                <Metric label="Debt / equity" value={formatMultiple(latest?.debtToEquity)} />
                <Metric label="EPS" value={formatRupees(latest?.eps)} />
                <Metric label="NAV / share" value={formatRupees(latest?.nav)} />
              </dl>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function valuationPosition(ipoPE?: number, industryPE?: number) {
  if (ipoPE == null || industryPE == null || industryPE <= 0) return null;
  const ratio = ipoPE / industryPE;
  return {
    marker: Math.min(Math.max(((ratio - 0.55) / 0.9) * 100, 3), 97),
    label: ratio < 0.85 ? "Below industry range" : ratio > 1.15 ? "Premium to industry" : "Near industry range",
    difference: ((ipoPE - industryPE) / industryPE) * 100,
  };
}

export function ValuationSection({
  ipo,
  financials,
  peers,
}: Pick<DetailDataProps, "ipo" | "financials" | "peers">) {
  const latest = [...financials].sort(
    (a, b) => yearOrder.indexOf(a.fiscalYear) - yearOrder.indexOf(b.fiscalYear),
  ).at(-1);
  const position = valuationPosition(ipo.ipoPE, ipo.industryPE);
  const positionStyle = position
    ? ({ "--valuation-position": `${position.marker}%` } as CSSProperties)
    : undefined;

  return (
    <section id="valuation" className={styles.section}>
      <SectionHeading
        eyebrow="At the upper price band"
        title="Valuation"
        description="Issue valuation alongside reported industry and peer reference points."
      />
      <dl className={styles.valuationMetrics}>
        <Metric label="IPO P/E" value={formatMultiple(ipo.ipoPE)} />
        <Metric label="Industry P/E" value={formatMultiple(ipo.industryPE)} />
        <Metric label="Diluted EPS" value={formatRupees(latest?.eps)} />
        <Metric label="Price / book" value={formatMultiple(ipo.priceToBook)} />
        <Metric label="Market cap" value={formatCrore(ipo.marketCapAtUpperBandCr)} />
        <Metric label="EV / EBITDA" value={formatMultiple(ipo.evToEbitda)} />
      </dl>

      {position ? (
        <div className={styles.valuationPosition}>
          <div className={styles.positionCopy}>
            <div>
              <span>Relative P/E position</span>
              <strong>{position.label}</strong>
            </div>
            <p>
              IPO P/E is {signedPercent(position.difference)} versus the reported industry P/E.
            </p>
          </div>
          <div className={styles.positionScale} style={positionStyle} aria-label={position.label}>
            <span>Lower valuation</span>
            <span>Fair range</span>
            <span>Premium valuation</span>
            <i aria-hidden="true" />
          </div>
        </div>
      ) : (
        <EmptyState title="Relative positioning is unavailable">
          Both issue and industry earnings multiples are required for this comparison.
        </EmptyState>
      )}

      <div className={styles.peerBlock}>
        <h3>Peer comparison</h3>
        {peers.length ? (
          <div className={styles.tableScroller}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">PAT</th>
                  <th scope="col">P/E</th>
                  <th scope="col">ROE</th>
                  <th scope="col">Market cap</th>
                </tr>
              </thead>
              <tbody>
                <tr className={styles.issuerRow}>
                  <th scope="row">{ipo.company.name}<small>IPO issuer</small></th>
                  <td>{formatCrore(latest?.revenueCr)}</td>
                  <td>{formatCrore(latest?.patCr)}</td>
                  <td>{formatMultiple(ipo.ipoPE)}</td>
                  <td>{formatPercent(latest?.roePercent)}</td>
                  <td>{formatCrore(ipo.marketCapAtUpperBandCr)}</td>
                </tr>
                {peers.map((peer) => (
                  <tr key={peer.id}>
                    <th scope="row">{peer.companyName}</th>
                    <td>{formatCrore(peer.revenueCr)}</td>
                    <td>{formatCrore(peer.patCr)}</td>
                    <td>{formatMultiple(peer.pe)}</td>
                    <td>{formatPercent(peer.roePercent)}</td>
                    <td>{formatCrore(peer.marketCapCr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Verified peer data is not available">
            Peer metrics will appear when they are supplied on a comparable reporting basis.
          </EmptyState>
        )}
      </div>
      <p className={styles.dataNote}>
        Valuation comparisons are descriptive only. Accounting periods, business mix and one-off items can reduce comparability; this is not a buy or sell recommendation.
      </p>
    </section>
  );
}
