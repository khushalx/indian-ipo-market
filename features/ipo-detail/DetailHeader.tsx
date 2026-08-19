import {
  ArrowUpRight,
  FileText,
  GitCompareArrows,
} from "lucide-react";
import Link from "next/link";
import { WatchlistButton } from "@/components/watchlist-button";
import type { IPO, IPODocument } from "@/types";
import {
  formatCrore,
  formatBoard,
  formatCompactDateTime,
  formatDate,
  formatExchange,
  formatMultiple,
  formatRupees,
  formatPriceBand,
  signedPercent,
  signedRupees,
  titleCase,
} from "./format";
import styles from "./ipo-detail.module.css";
import { SourceLine } from "./DetailPrimitives";

const documentHref = (documents: IPODocument[], type: IPODocument["type"]) => {
  const document = documents.find((item) => item.type === type);
  return document?.availability === "not_found" ? undefined : document?.url;
};

const finalSubscriptionStatuses = new Set<IPO["status"]>([
  "closed",
  "allotment_pending",
  "allotment_complete",
  "listing_upcoming",
  "listed",
]);

function subscriptionDetail(ipo: IPO): string {
  if (ipo.subscriptionTotal == null) return "No subscription figure reported";
  if (ipo.status === "open") return "As reported so far";
  if (finalSubscriptionStatuses.has(ipo.status)) return "Final reported";
  return "Latest reported value";
}

export function DetailHeader({
  ipo,
  documents,
}: {
  ipo: IPO;
  documents: IPODocument[];
}) {
  const minimumInvestment = ipo.priceBandMax != null && ipo.lotSize != null ? ipo.priceBandMax * ipo.lotSize : undefined;
  const gmpPercent =
    ipo.gmp == null || !ipo.priceBandMax
      ? undefined
      : (ipo.gmp / ipo.priceBandMax) * 100;
  const estimatedListingPrice =
    ipo.estimatedListingPrice ??
    (ipo.gmp == null || ipo.priceBandMax == null ? undefined : ipo.priceBandMax + ipo.gmp);
  const drhp = documentHref(documents, "drhp");
  const rhp = documentHref(documents, "rhp");
  const gmpTone = ipo.gmp == null || ipo.gmp === 0
    ? styles.gmpNeutral
    : ipo.gmp > 0
      ? styles.gmpPositive
      : styles.gmpNegative;

  return (
    <header className={styles.hero}>
      <div className={styles.heroUtility}>
        <div className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/">Market</Link>
          <span aria-hidden="true">/</span>
          <Link href="/ipos">IPOs</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{ipo.company.name}</span>
        </div>
        {ipo.mockDisclaimer ? <div className={styles.mockMarker}><span aria-hidden="true" />Development data · Not live</div> : <SourceLine source={ipo.source} updatedAt={ipo.updatedAt ?? ipo.fetchedAt} compact />}
      </div>

      <div className={styles.heroTop}>
        <div className={styles.companyIdentity}>
          <div className={styles.companyMonogram} aria-hidden="true">
            {ipo.company.name.charAt(0)}
          </div>
          <div>
            <div className={styles.labelRow}>
              <span className={`${styles.status} ${styles[`status_${ipo.status}`]}`}>
                {titleCase(ipo.status)}
              </span>
              <span>{formatBoard(ipo.type)}</span>
              <span>{ipo.exchange.length ? ipo.exchange.map(formatExchange).join(" · ") : "Exchange not announced"}</span>
            </div>
            <h1>{ipo.company.name} IPO</h1>
            <p>
              {ipo.company.industry ?? "Industry not available"} <span aria-hidden="true">·</span>{" "}
              {ipo.company.headquarters ?? "Location not available"}
            </p>
          </div>
        </div>

        <div className={styles.actions} aria-label="IPO actions">
          <WatchlistButton ipoId={ipo.id} className={styles.secondaryAction} />
          <Link
            className={styles.secondaryAction}
            href={`/compare?ipos=${encodeURIComponent(ipo.slug)}`}
          >
            <GitCompareArrows aria-hidden="true" size={15} />
            Compare
          </Link>
          {drhp ? (
            <a className={styles.documentAction} href={drhp} target="_blank" rel="noreferrer">
              <FileText aria-hidden="true" size={14} /> DRHP
              <ArrowUpRight aria-hidden="true" size={12} />
            </a>
          ) : null}
          {rhp ? (
            <a className={styles.documentAction} href={rhp} target="_blank" rel="noreferrer">
              <FileText aria-hidden="true" size={14} /> RHP
              <ArrowUpRight aria-hidden="true" size={12} />
            </a>
          ) : null}
        </div>
      </div>

      <dl className={styles.coreMetrics}>
        <div>
          <dt>Price band</dt>
          <dd>
            {formatPriceBand(ipo.priceBandMin, ipo.priceBandMax)}
          </dd>
          <small>Face value {formatRupees(ipo.faceValue)}</small>
        </div>
        <div>
          <dt>Issue size</dt>
          <dd>{formatCrore(ipo.issueSizeCr)}</dd>
          <small>{titleCase(ipo.type)} issue</small>
        </div>
        <div>
          <dt>Lot / minimum</dt>
          <dd>{ipo.lotSize == null ? "Not announced" : `${ipo.lotSize.toLocaleString("en-IN")} shares`}</dd>
          <small>{formatRupees(minimumInvestment)} at upper band</small>
        </div>
        <div className={`${styles.gmpMetric} ${gmpTone}`}>
          <dt>Current GMP</dt>
          <dd>{ipo.gmp == null ? "Not available" : signedRupees(ipo.gmp)}</dd>
          <small>
            {ipo.gmp == null ? "No unofficial quote reported" : (
              <>
                {gmpPercent == null ? null : `${signedPercent(gmpPercent)} · `}
                Unofficial
                {ipo.gmpUpdatedAt ? ` · Updated ${formatCompactDateTime(ipo.gmpUpdatedAt)}` : " · Update time unavailable"}
              </>
            )}
          </small>
        </div>
        <div>
          <dt>Est. listing price</dt>
          <dd>{formatRupees(estimatedListingPrice)}</dd>
          <small>Upper band + GMP</small>
        </div>
        <div>
          <dt>Total subscription</dt>
          <dd>{ipo.subscriptionTotal == null ? "Not available" : formatMultiple(ipo.subscriptionTotal)}</dd>
          <small>{subscriptionDetail(ipo)}</small>
        </div>
      </dl>

      <dl className={styles.keyDates}>
        <div>
          <dt>Opens</dt>
          <dd>{formatDate(ipo.openDate)}</dd>
        </div>
        <div>
          <dt>Closes</dt>
          <dd>{formatDate(ipo.closeDate)}</dd>
        </div>
        <div>
          <dt>Allotment</dt>
          <dd>{formatDate(ipo.allotmentDate)}</dd>
        </div>
        <div>
          <dt>Listing</dt>
          <dd>{formatDate(ipo.listingDate)}</dd>
        </div>
      </dl>
    </header>
  );
}
