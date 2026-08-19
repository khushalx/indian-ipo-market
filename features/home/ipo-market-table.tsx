"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { WatchlistButton } from "@/components/watchlist-button";
import { formatCrore, formatDate, formatIndianCurrency, formatSubscription } from "@/lib/format";
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

function gmpPercent(ipo: IPO) {
  return ipo.gmp == null ? undefined : (ipo.gmp / ipo.priceBandMax) * 100;
}

function date(value?: string) {
  return formatDate(value, "short");
}

export function IPOMarketTable({ ipos }: { ipos: IPO[] }) {
  const [active, setActive] = useState<Tab>("open");
  const visible = useMemo(() => {
    const matches = ipos.filter((ipo) => active === "sme" ? ipo.type === "sme" : ipo.status === active);
    return (matches.length ? matches : ipos).slice(0, 6);
  }, [active, ipos]);

  return (
    <div>
      <div className={styles.tabs} role="group" aria-label="Filter featured IPOs">
        {tabs.map((tab) => {
          const count = ipos.filter((ipo) => tab.key === "sme" ? ipo.type === "sme" : ipo.status === tab.key).length;
          return (
            <button key={tab.key} aria-pressed={active === tab.key} className={active === tab.key ? styles.active : undefined} onClick={() => setActive(tab.key)}>
              {tab.label} <span>{count}</span>
            </button>
          );
        })}
        <Link href="/ipos">All IPOs <ArrowUpRight size={12} aria-hidden="true" /></Link>
      </div>

      <div className={styles.desktopTable}>
        <table>
          <thead><tr><th>Company</th><th>Status</th><th>Price band</th><th>Issue size</th><th>GMP</th><th>Subscription</th><th>Open / close</th><th>Listing</th><th><span className="sr-only">Watchlist</span></th></tr></thead>
          <tbody>
            {visible.map((ipo) => {
              const pct = gmpPercent(ipo);
              return (
                <tr key={ipo.id}>
                  <td><Link href={`/ipo/${ipo.slug}`} className={styles.company}><strong>{ipo.company.name}</strong><small>{ipo.type === "mainboard" ? "Mainboard" : "SME"} · {ipo.company.industry}</small></Link></td>
                  <td><span className={`${styles.status} ${styles[ipo.status]}`}>{ipo.status}</span></td>
                  <td className={styles.number}>{formatIndianCurrency(ipo.priceBandMin)}–{formatIndianCurrency(ipo.priceBandMax).replace("₹", "")}</td>
                  <td className={styles.number}>{formatCrore(ipo.issueSizeCr)}</td>
                  <td className={styles.number}>{ipo.gmp == null ? <span className={styles.missing}>—</span> : <><b className="financial-up">+{formatIndianCurrency(ipo.gmp)}</b><small className="financial-up">+{pct?.toFixed(1)}%</small></>}</td>
                  <td className={`${styles.number} ${styles.strong}`}>{formatSubscription(ipo.subscriptionTotal)}</td>
                  <td className={styles.number}>{date(ipo.openDate)}–{date(ipo.closeDate)}</td>
                  <td className={styles.number}>{date(ipo.listingDate)}</td>
                  <td><WatchlistButton ipoId={ipo.id} compact /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.mobileList}>
        {visible.map((ipo) => (
          <article key={ipo.id} className={styles.mobileItem}>
            <div className={styles.mobileTop}>
              <Link href={`/ipo/${ipo.slug}`}><strong>{ipo.company.name}</strong><small>{ipo.type === "mainboard" ? "Mainboard" : "SME"} · {ipo.company.industry}</small></Link>
              <WatchlistButton ipoId={ipo.id} compact />
            </div>
            <div className={styles.mobileMeta}><span className={`${styles.status} ${styles[ipo.status]}`}>{ipo.status}</span><span>{date(ipo.openDate)}–{date(ipo.closeDate)}</span></div>
            <dl>
              <div><dt>Price band</dt><dd>{formatIndianCurrency(ipo.priceBandMin)}–{formatIndianCurrency(ipo.priceBandMax).replace("₹", "")}</dd></div>
              <div><dt>Issue size</dt><dd>{formatCrore(ipo.issueSizeCr)}</dd></div>
              <div><dt>GMP</dt><dd className={ipo.gmp != null ? "financial-up" : undefined}>{ipo.gmp == null ? "—" : `+${formatIndianCurrency(ipo.gmp)}`}</dd></div>
              <div><dt>Subscription</dt><dd>{formatSubscription(ipo.subscriptionTotal)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
