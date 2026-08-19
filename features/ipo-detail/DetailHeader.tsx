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
  formatDate,
  formatExchange,
  formatMultiple,
  formatRupees,
  signedPercent,
  signedRupees,
  titleCase,
} from "./format";
import styles from "./ipo-detail.module.css";

const documentHref = (documents: IPODocument[], type: IPODocument["type"]) =>
  documents.find((document) => document.type === type)?.url;

export function DetailHeader({
  ipo,
  documents,
}: {
  ipo: IPO;
  documents: IPODocument[];
}) {
  const minimumInvestment = ipo.priceBandMax * ipo.lotSize;
  const gmpPercent =
    ipo.gmp == null || ipo.priceBandMax === 0
      ? undefined
      : (ipo.gmp / ipo.priceBandMax) * 100;
  const estimatedListingPrice =
    ipo.estimatedListingPrice ??
    (ipo.gmp == null ? undefined : ipo.priceBandMax + ipo.gmp);
  const drhp = documentHref(documents, "drhp");
  const rhp = documentHref(documents, "rhp");

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
        <div className={styles.mockMarker}><span aria-hidden="true" />Development data · Not live</div>
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
              <span>{titleCase(ipo.type)}</span>
              <span>{ipo.exchange.map(formatExchange).join(" · ")}</span>
            </div>
            <h1>{ipo.company.name} IPO</h1>
            <p>
              {ipo.company.industry} <span aria-hidden="true">·</span>{" "}
              {ipo.company.headquarters}
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
            {formatRupees(ipo.priceBandMin)}–{formatRupees(ipo.priceBandMax)}
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
          <dd>{ipo.lotSize.toLocaleString("en-IN")} shares</dd>
          <small>{formatRupees(minimumInvestment)} at upper band</small>
        </div>
        <div className={styles.gmpMetric}>
          <dt>Current GMP</dt>
          <dd>{signedRupees(ipo.gmp)}</dd>
          <small>{signedPercent(gmpPercent)} unofficial</small>
        </div>
        <div>
          <dt>Est. listing price</dt>
          <dd>{formatRupees(estimatedListingPrice)}</dd>
          <small>Upper band + GMP</small>
        </div>
        <div>
          <dt>Total subscription</dt>
          <dd>{formatMultiple(ipo.subscriptionTotal)}</dd>
          <small>{ipo.status === "open" ? "As reported so far" : "Final reported"}</small>
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
