"use client";

import { ArrowDownUp, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { WatchlistButton } from "@/components/watchlist-button";
import { formatCrore, formatDate, formatIndianCurrency, formatSubscription } from "@/lib/format";
import type { Exchange, IPO, IPOSort, IPOStatus, IPOType } from "@/types";
import styles from "./ipo-explorer.module.css";

type Size = "all" | "under100" | "100to500" | "500to1000" | "over1000";
type Filters = { type: "all" | IPOType; status: "all" | IPOStatus; year: "all" | string; size: Size; exchange: "all" | Exchange };

const initialFilters: Filters = { type: "all", status: "all", year: "all", size: "all", exchange: "all" };
function date(value?: string) { return formatDate(value, "medium"); }
function gmpPct(ipo: IPO) { return ipo.gmp == null ? undefined : (ipo.gmp / ipo.priceBandMax) * 100; }
function matchesSize(ipo: IPO, size: Size) {
  if (size === "under100") return ipo.issueSizeCr < 100;
  if (size === "100to500") return ipo.issueSizeCr >= 100 && ipo.issueSizeCr < 500;
  if (size === "500to1000") return ipo.issueSizeCr >= 500 && ipo.issueSizeCr < 1000;
  if (size === "over1000") return ipo.issueSizeCr >= 1000;
  return true;
}

export function IPOExplorer({ ipos }: { ipos: IPO[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [sort, setSort] = useState<IPOSort>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ipos
      .filter((ipo) => !normalized || `${ipo.company.name} ${ipo.company.industry} ${ipo.company.sector}`.toLowerCase().includes(normalized))
      .filter((ipo) => filters.type === "all" || ipo.type === filters.type)
      .filter((ipo) => filters.status === "all" || ipo.status === filters.status)
      .filter((ipo) => filters.year === "all" || ipo.openDate?.startsWith(filters.year))
      .filter((ipo) => filters.exchange === "all" || ipo.exchange.includes(filters.exchange))
      .filter((ipo) => matchesSize(ipo, filters.size))
      .sort((a, b) => {
        if (sort === "issue_size") return b.issueSizeCr - a.issueSizeCr;
        if (sort === "gmp_percent") return (gmpPct(b) ?? -Infinity) - (gmpPct(a) ?? -Infinity);
        if (sort === "subscription") return (b.subscriptionTotal ?? -Infinity) - (a.subscriptionTotal ?? -Infinity);
        if (sort === "listing_gain") return (b.listingGainPercent ?? -Infinity) - (a.listingGainPercent ?? -Infinity);
        return (b.openDate ?? "").localeCompare(a.openDate ?? "");
      });
  }, [filters, ipos, query, sort]);

  const activeCount = Object.entries(filters).filter(([, value]) => value !== "all").length;
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const reset = () => { setFilters(initialFilters); setQuery(""); setSort("newest"); };

  return (
    <div>
      <div className={styles.controls}>
        <label className={styles.search}><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies or industries" aria-label="Search IPOs" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>}</label>
        <button className={styles.mobileFilter} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}><SlidersHorizontal size={14} /> Filters {activeCount > 0 && <b>{activeCount}</b>}</button>
        <label className={styles.sort}><ArrowDownUp size={13} /><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as IPOSort)} aria-label="Sort IPOs"><option value="newest">Newest</option><option value="issue_size">Issue size</option><option value="gmp_percent">GMP %</option><option value="subscription">Subscription</option><option value="listing_gain">Listing gain</option></select></label>
      </div>

      <div className={`${styles.filterBar} ${filtersOpen ? styles.filterBarOpen : ""}`}>
        <Filter label="Board" value={filters.type} onChange={(value) => update("type", value as Filters["type"])} options={[{value:"all",label:"All"},{value:"mainboard",label:"Mainboard"},{value:"sme",label:"SME"}]} />
        <Filter label="Status" value={filters.status} onChange={(value) => update("status", value as Filters["status"])} options={[{value:"all",label:"All"},{value:"upcoming",label:"Upcoming"},{value:"open",label:"Open"},{value:"closed",label:"Closed"},{value:"listed",label:"Listed"}]} />
        <Filter label="Year" value={filters.year} onChange={(value) => update("year", value)} options={[{value:"all",label:"All years"},{value:"2026",label:"2026"},{value:"2025",label:"2025"}]} />
        <Filter label="Issue size" value={filters.size} onChange={(value) => update("size", value as Size)} options={[{value:"all",label:"All sizes"},{value:"under100",label:"Under ₹100 Cr"},{value:"100to500",label:"₹100–500 Cr"},{value:"500to1000",label:"₹500–1,000 Cr"},{value:"over1000",label:"Over ₹1,000 Cr"}]} />
        <Filter label="Exchange" value={filters.exchange} onChange={(value) => update("exchange", value as Filters["exchange"])} options={[{value:"all",label:"All exchanges"},{value:"NSE",label:"NSE"},{value:"BSE",label:"BSE"},{value:"NSE_EMERGE",label:"NSE Emerge"},{value:"BSE_SME",label:"BSE SME"}]} />
        {activeCount > 0 && <button className={styles.clearFilters} onClick={() => setFilters(initialFilters)}>Clear</button>}
      </div>

      <div className={styles.resultMeta}><p><strong>{results.length}</strong> IPOs</p><span>Development dataset · Indicative values only</span></div>

      {results.length ? (
        <>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Company</th><th>Board</th><th>Status</th><th>Price band</th><th>Issue size</th><th>GMP</th><th>Subscription</th><th>Open date</th><th>Listing / gain</th><th><span className="sr-only">Watchlist</span></th></tr></thead>
              <tbody>{results.map((ipo) => <DesktopRow key={ipo.id} ipo={ipo} />)}</tbody>
            </table>
          </div>
          <div className={styles.mobileResults}>{results.map((ipo) => <MobileResult key={ipo.id} ipo={ipo} />)}</div>
        </>
      ) : (
        <div className={styles.empty}><Search size={20} /><h2>No IPOs match these filters</h2><p>Try a broader status, board or issue-size range.</p><button onClick={reset}>Reset directory</button></div>
      )}
    </div>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: Array<{value:string;label:string}>; onChange: (value:string)=>void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

function DesktopRow({ ipo }: { ipo: IPO }) {
  const pct = gmpPct(ipo);
  return (
    <tr>
      <td><Link className={styles.company} href={`/ipo/${ipo.slug}`}><span>{ipo.company.name.charAt(0)}</span><div><strong>{ipo.company.name}</strong><small>{ipo.company.industry}</small></div></Link></td>
      <td>{ipo.type === "mainboard" ? "Mainboard" : "SME"}<small className={styles.exchanges}>{ipo.exchange.join(" · ").replace("_", " ")}</small></td>
      <td><span className={`${styles.status} ${styles[ipo.status]}`}>{ipo.status}</span></td>
      <td className={styles.numeric}>{formatIndianCurrency(ipo.priceBandMin)}–{formatIndianCurrency(ipo.priceBandMax).replace("₹", "")}</td>
      <td className={styles.numeric}>{formatCrore(ipo.issueSizeCr)}</td>
      <td className={styles.numeric}>{ipo.gmp == null ? <span className={styles.na}>—</span> : <><b className="financial-up">+{formatIndianCurrency(ipo.gmp)}</b><small className="financial-up">+{pct?.toFixed(1)}%</small></>}</td>
      <td className={`${styles.numeric} ${styles.bold}`}>{formatSubscription(ipo.subscriptionTotal)}</td>
      <td className={styles.numeric}>{date(ipo.openDate)}</td>
      <td className={styles.numeric}>{ipo.listingGainPercent == null ? date(ipo.listingDate) : <><b>{formatIndianCurrency(ipo.listingPrice)}</b><small className={ipo.listingGainPercent >= 0 ? "financial-up" : "financial-down"}>{ipo.listingGainPercent >= 0 ? "+" : ""}{ipo.listingGainPercent.toFixed(1)}%</small></>}</td>
      <td><WatchlistButton ipoId={ipo.id} compact /></td>
    </tr>
  );
}

function MobileResult({ ipo }: { ipo: IPO }) {
  return (
    <article>
      <div className={styles.mobileTitle}><Link href={`/ipo/${ipo.slug}`}><span>{ipo.company.name.charAt(0)}</span><div><strong>{ipo.company.name}</strong><small>{ipo.type === "mainboard" ? "Mainboard" : "SME"} · {ipo.company.industry}</small></div></Link><WatchlistButton ipoId={ipo.id} compact /></div>
      <div className={styles.mobileState}><span className={`${styles.status} ${styles[ipo.status]}`}>{ipo.status}</span><time>{date(ipo.openDate)}</time></div>
      <dl><div><dt>Price band</dt><dd>{formatIndianCurrency(ipo.priceBandMin)}–{formatIndianCurrency(ipo.priceBandMax).replace("₹", "")}</dd></div><div><dt>Issue size</dt><dd>{formatCrore(ipo.issueSizeCr)}</dd></div><div><dt>GMP</dt><dd className={ipo.gmp != null ? "financial-up" : undefined}>{ipo.gmp == null ? "—" : `+${formatIndianCurrency(ipo.gmp)}`}</dd></div><div><dt>Subscribed</dt><dd>{formatSubscription(ipo.subscriptionTotal)}</dd></div></dl>
      <Link className={styles.viewDetail} href={`/ipo/${ipo.slug}`}>View IPO details <span>→</span></Link>
    </article>
  );
}
