"use client";

import { ArrowUpRight, LayoutGrid, Table as TableIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GMPQuote } from "@/components/gmp-quote";
import { WatchlistButton } from "@/components/watchlist-button";
import { formatBoard, formatCrore, formatDate, formatIndianCurrency, formatPriceBand, formatSubscription, titleCase } from "@/lib/format";
import type { IPO } from "@/types";
import styles from "./ipo-market-table.module.css";

type Tab = "open" | "upcoming" | "closed" | "listed" | "sme";

const tabs: Array<{ key: Tab; label: string }> = [
  { key: "open", label: "Open" },
  { key: "upcoming", label: "Upcoming" },
  { key: "closed", label: "Closed" },
  { key: "listed", label: "Listed" },
  { key: "sme", label: "SME" },
];

function date(value?: string) {
  return formatDate(value, "short");
}

function offerDates(ipo: IPO) {
  if (!ipo.openDate || !ipo.closeDate) return "Dates not announced";
  return `${date(ipo.openDate)}–${date(ipo.closeDate)}`;
}

export function IPOMarketTable({ ipos }: { ipos: IPO[] }) {
  const [active, setActive] = useState<Tab>("open");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const visible = useMemo(() => {
    const matches = ipos.filter((ipo) => active === "sme" ? ipo.type === "sme" : ipo.status === active);
    return matches.slice(0, 6);
  }, [active, ipos]);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.tabs} role="group" aria-label="Filter featured IPOs">
          {tabs.map((tab) => {
            const count = ipos.filter((ipo) => tab.key === "sme" ? ipo.type === "sme" : ipo.status === tab.key).length;
            return (
              <button
                key={tab.key}
                aria-pressed={active === tab.key}
                className={active === tab.key ? styles.active : undefined}
                onClick={() => setActive(tab.key)}
              >
                {tab.label} <span className={styles.tabCount}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.topActions}>
          <div className={styles.viewToggle} role="group" aria-label="View mode">
            <button
              type="button"
              className={viewMode === "table" ? styles.viewBtnActive : styles.viewBtn}
              onClick={() => setViewMode("table")}
              aria-label="Table view"
              title="Table view"
            >
              <TableIcon size={15} />
            </button>
            <button
              type="button"
              className={viewMode === "cards" ? styles.viewBtnActive : styles.viewBtn}
              onClick={() => setViewMode("cards")}
              aria-label="Cards view"
              title="Cards view"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          <Link href="/ipos" className={styles.allLink}>
            All IPOs <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className={styles.desktopTable}>
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Price band</th>
                <th>Issue size</th>
                <th>Lot / Min Invest</th>
                <th>GMP</th>
                <th>Subscription</th>
                <th>Open / close</th>
                <th>Listing</th>
                <th><span className="sr-only">Watchlist</span></th>
              </tr>
            </thead>
            <tbody>
              {!visible.length ? (
                <tr><td colSpan={10} className={styles.emptyCell}>No verified IPO records are available for this view.</td></tr>
              ) : visible.map((ipo) => {
                const minInvest = ipo.priceBandMax && ipo.lotSize ? ipo.priceBandMax * ipo.lotSize : undefined;
                return (
                  <tr key={ipo.id}>
                    <td>
                      <Link href={`/ipo/${ipo.slug}`} className={styles.company}>
                        <span className={styles.companyIcon}>{ipo.company.name.charAt(0)}</span>
                        <div>
                          <strong>{ipo.company.name}</strong>
                          <small>{formatBoard(ipo.type)} · {ipo.company.industry ?? "Industry not available"}</small>
                        </div>
                      </Link>
                    </td>
                    <td><span className={`${styles.status} ${styles[ipo.status]}`}>{titleCase(ipo.status)}</span></td>
                    <td className={styles.number}>{formatPriceBand(ipo.priceBandMin, ipo.priceBandMax)}</td>
                    <td className={styles.number}>{formatCrore(ipo.issueSizeCr)}</td>
                    <td className={styles.number}>
                      {ipo.lotSize ? (
                        <>
                          <b>{ipo.lotSize} shares</b>
                          <small>{minInvest ? formatIndianCurrency(minInvest) : "—"}</small>
                        </>
                      ) : "—"}
                    </td>
                    <td className={styles.number}><GMPQuote value={ipo.gmp} upperPriceBand={ipo.priceBandMax} updatedAt={ipo.gmpUpdatedAt} /></td>
                    <td className={`${styles.number} ${styles.strong}`}>{formatSubscription(ipo.subscriptionTotal)}</td>
                    <td className={styles.number}>{offerDates(ipo)}</td>
                    <td className={styles.number}>{date(ipo.listingDate)}</td>
                    <td><WatchlistButton ipoId={ipo.id} compact /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {visible.map((ipo) => {
            const minInvest = ipo.priceBandMax && ipo.lotSize ? ipo.priceBandMax * ipo.lotSize : undefined;
            return (
              <article key={ipo.id} className={styles.gridCard}>
                <div className={styles.cardHeader}>
                  <Link href={`/ipo/${ipo.slug}`} className={styles.cardTitle}>
                    <span className={styles.companyIcon}>{ipo.company.name.charAt(0)}</span>
                    <div>
                      <strong>{ipo.company.name}</strong>
                      <small>{formatBoard(ipo.type)} · {ipo.company.industry ?? "Industry not available"}</small>
                    </div>
                  </Link>
                  <WatchlistButton ipoId={ipo.id} compact />
                </div>
                <div className={styles.cardBadgeRow}>
                  <span className={`${styles.status} ${styles[ipo.status]}`}>{titleCase(ipo.status)}</span>
                  <span className={styles.dateBadge}>{offerDates(ipo)}</span>
                </div>
                <dl className={styles.cardMetrics}>
                  <div>
                    <dt>Price Band</dt>
                    <dd>{formatPriceBand(ipo.priceBandMin, ipo.priceBandMax)}</dd>
                  </div>
                  <div>
                    <dt>Issue Size</dt>
                    <dd>{formatCrore(ipo.issueSizeCr)}</dd>
                  </div>
                  <div>
                    <dt>GMP</dt>
                    <dd><GMPQuote value={ipo.gmp} upperPriceBand={ipo.priceBandMax} updatedAt={ipo.gmpUpdatedAt} /></dd>
                  </div>
                  <div>
                    <dt>Subscribed</dt>
                    <dd className={styles.strong}>{formatSubscription(ipo.subscriptionTotal)}</dd>
                  </div>
                </dl>
                {minInvest && (
                  <div className={styles.cardFooter}>
                    <span>Min Investment: <strong>{formatIndianCurrency(minInvest)}</strong> ({ipo.lotSize} shares)</span>
                    <Link href={`/ipo/${ipo.slug}`} className={styles.cardLink}>View Details <ArrowUpRight size={13} /></Link>
                  </div>
                )}
              </article>
            );
          })}
          {!visible.length && <p className={styles.emptyGrid}>No verified IPO records are available for this view.</p>}
        </div>
      )}

      {/* Mobile view fallback */}
      <div className={styles.mobileList}>
        {visible.map((ipo) => (
          <article key={ipo.id} className={styles.mobileItem}>
            <div className={styles.mobileTop}>
              <Link href={`/ipo/${ipo.slug}`} className={styles.company}>
                <span className={styles.companyIcon}>{ipo.company.name.charAt(0)}</span>
                <div>
                  <strong>{ipo.company.name}</strong>
                  <small>{formatBoard(ipo.type)} · {ipo.company.industry ?? "Industry not available"}</small>
                </div>
              </Link>
              <WatchlistButton ipoId={ipo.id} compact />
            </div>
            <div className={styles.mobileMeta}>
              <span className={`${styles.status} ${styles[ipo.status]}`}>{titleCase(ipo.status)}</span>
              <span>{offerDates(ipo)}</span>
            </div>
            <dl>
              <div><dt>Price band</dt><dd>{formatPriceBand(ipo.priceBandMin, ipo.priceBandMax)}</dd></div>
              <div><dt>Issue size</dt><dd>{formatCrore(ipo.issueSizeCr)}</dd></div>
              <div><dt>GMP</dt><dd><GMPQuote value={ipo.gmp} upperPriceBand={ipo.priceBandMax} updatedAt={ipo.gmpUpdatedAt} /></dd></div>
              <div><dt>Subscription</dt><dd>{formatSubscription(ipo.subscriptionTotal)}</dd></div>
            </dl>
          </article>
        ))}
        {!visible.length ? <p className={styles.emptyCell}>No verified IPO records are available for this view.</p> : null}
      </div>
    </div>
  );
}

