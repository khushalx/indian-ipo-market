"use client";

import { ArrowDownUp, Filter as FilterIcon, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GMPQuote } from "@/components/gmp-quote";
import { WatchlistButton } from "@/components/watchlist-button";
import { calculateGMPPercent, formatBoard, formatCrore, formatDate, formatIndianCurrency, formatPriceBand, formatSubscription, titleCase } from "@/lib/format";
import type { Exchange, IPO, IPOSort, IPOStatus, IPOType } from "@/types";
import styles from "./ipo-explorer.module.css";

type Size = "all" | "under100" | "100to500" | "500to1000" | "over1000";
type Filters = { type: "all" | IPOType; status: "all" | IPOStatus; year: "all" | string; size: Size; exchange: "all" | Exchange };

const initialFilters: Filters = { type: "all", status: "all", year: "all", size: "all", exchange: "all" };
function date(value?: string) { return formatDate(value, "medium"); }
function gmpPct(ipo: IPO) { return calculateGMPPercent(ipo.gmp, ipo.priceBandMax); }
function matchesSize(ipo: IPO, size: Size) {
  if (size !== "all" && ipo.issueSizeCr == null) return false;
  if (size === "under100") return ipo.issueSizeCr! < 100;
  if (size === "100to500") return ipo.issueSizeCr! >= 100 && ipo.issueSizeCr! < 500;
  if (size === "500to1000") return ipo.issueSizeCr! >= 500 && ipo.issueSizeCr! < 1000;
  if (size === "over1000") return ipo.issueSizeCr! >= 1000;
  return true;
}

export function IPOExplorer({ ipos }: { ipos: IPO[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [sort, setSort] = useState<IPOSort>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickChip, setQuickChip] = useState<string>("all");

  const newFilings = useMemo(
    () => ipos.filter((ipo) => ipo.latestFilingDate || ipo.status === "drhp_filed" || ipo.status === "rhp_filed").sort((a, b) => (b.latestFilingDate ?? "").localeCompare(a.latestFilingDate ?? "")).slice(0, 5),
    [ipos],
  );
  const years = useMemo(
    () => Array.from(new Set(ipos.map((ipo) => (ipo.openDate ?? ipo.latestFilingDate)?.slice(0, 4)).filter((value): value is string => Boolean(value)))).sort().reverse(),
    [ipos],
  );
  const isMock = ipos.some((ipo) => ipo.mockDisclaimer);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ipos
      .filter((ipo) => !normalized || `${ipo.company.name} ${ipo.company.industry ?? ""} ${ipo.company.sector ?? ""}`.toLowerCase().includes(normalized))
      .filter((ipo) => {
        if (quickChip === "mainboard") return ipo.type === "mainboard";
        if (quickChip === "sme") return ipo.type === "sme";
        if (quickChip === "open") return ipo.status === "open";
        if (quickChip === "high_gmp") return (gmpPct(ipo) ?? 0) >= 20;
        if (quickChip === "mega") return (ipo.issueSizeCr ?? 0) >= 1000;
        return true;
      })
      .filter((ipo) => filters.type === "all" || ipo.type === filters.type)
      .filter((ipo) => filters.status === "all" || ipo.status === filters.status)
      .filter((ipo) => filters.year === "all" || ipo.openDate?.startsWith(filters.year))
      .filter((ipo) => filters.exchange === "all" || ipo.exchange.includes(filters.exchange))
      .filter((ipo) => matchesSize(ipo, filters.size))
      .sort((a, b) => {
        if (sort === "issue_size") return (b.issueSizeCr ?? -Infinity) - (a.issueSizeCr ?? -Infinity);
        if (sort === "gmp_percent") return (gmpPct(b) ?? -Infinity) - (gmpPct(a) ?? -Infinity);
        if (sort === "subscription") return (b.subscriptionTotal ?? -Infinity) - (a.subscriptionTotal ?? -Infinity);
        if (sort === "listing_gain") return (b.listingGainPercent ?? -Infinity) - (a.listingGainPercent ?? -Infinity);
        return (b.openDate ?? b.latestFilingDate ?? "").localeCompare(a.openDate ?? a.latestFilingDate ?? "");
      });
  }, [filters, ipos, query, quickChip, sort]);

  const activeCount = Object.entries(filters).filter(([, value]) => value !== "all").length;
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const reset = () => { setFilters(initialFilters); setQuery(""); setSort("newest"); setQuickChip("all"); };

  return (
    <div className={styles.explorerWrap}>
      {/* Regulatory Pipeline Highlight */}
      {newFilings.length ? (
        <section className={styles.newFilings} aria-labelledby="new-filings-heading">
          <div className={styles.filingHead}>
            <p className="section-kicker"><Sparkles size={12} aria-hidden="true" /> REGULATORY PIPELINE</p>
            <h2 id="new-filings-heading">New filings</h2>
          </div>
          <div className={styles.filingCards}>
            {newFilings.map((ipo) =>
              ipo.latestDocumentUrl && ipo.latestDocumentAvailability !== "not_found" ? (
                <a key={ipo.id} href={ipo.latestDocumentUrl} target="_blank" rel="noreferrer" className={styles.filingCard}>
                  <strong>{ipo.company.name}</strong>
                  <span>{ipo.latestFilingType?.replaceAll("_", " ") ?? ipo.status.replaceAll("_", " ")} · {date(ipo.latestFilingDate)}</span>
                </a>
              ) : (
                <Link key={ipo.id} href={`/ipo/${ipo.slug}`} className={styles.filingCard}>
                  <strong>{ipo.company.name}</strong>
                  <span>{ipo.status.replaceAll("_", " ")} · {date(ipo.latestFilingDate)}</span>
                </Link>
              )
            )}
          </div>
        </section>
      ) : null}

      {/* Quick Filter Chips */}
      <div className={styles.quickChips} role="group" aria-label="Quick category filters">
        <button type="button" className={quickChip === "all" ? styles.chipActive : styles.chip} onClick={() => setQuickChip("all")}>All Issues ({ipos.length})</button>
        <button type="button" className={quickChip === "mainboard" ? styles.chipActive : styles.chip} onClick={() => setQuickChip("mainboard")}>Mainboard</button>
        <button type="button" className={quickChip === "sme" ? styles.chipActive : styles.chip} onClick={() => setQuickChip("sme")}>SME Issues</button>
        <button type="button" className={quickChip === "open" ? styles.chipActive : styles.chip} onClick={() => setQuickChip("open")}>Open for Bidding</button>
        <button type="button" className={quickChip === "high_gmp" ? styles.chipActive : styles.chip} onClick={() => setQuickChip("high_gmp")}>High GMP (&gt;20%)</button>
        <button type="button" className={quickChip === "mega" ? styles.chipActive : styles.chip} onClick={() => setQuickChip("mega")}>Mega Issues (&gt;₹1,000 Cr)</button>
      </div>

      {/* Search & Toolbar */}
      <div className={styles.controls}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, industry or sector..." aria-label="Search IPOs" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
        </label>
        <button type="button" className={styles.mobileFilter} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
          <SlidersHorizontal size={14} /> Filters {activeCount > 0 && <b>{activeCount}</b>}
        </button>
        <label className={styles.sort}>
          <ArrowDownUp size={14} />
          <span>Sort:</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as IPOSort)} aria-label="Sort IPOs">
            <option value="newest">Newest First</option>
            <option value="issue_size">Issue Size (High to Low)</option>
            <option value="gmp_percent">GMP % (High to Low)</option>
            <option value="subscription">Subscription Multiple</option>
            <option value="listing_gain">Listing Gain %</option>
          </select>
        </label>
      </div>

      {/* Multi-filter Bar */}
      <div className={`${styles.filterBar} ${filtersOpen ? styles.filterBarOpen : ""}`}>
        <Filter label="Board" value={filters.type} onChange={(value) => update("type", value as Filters["type"])} options={[{value:"all",label:"All Boards"},{value:"mainboard",label:"Mainboard"},{value:"sme",label:"SME"}]} />
        <Filter label="Status" value={filters.status} onChange={(value) => update("status", value as Filters["status"])} options={[{value:"all",label:"All Statuses"},{value:"drhp_filed",label:"DRHP filed"},{value:"rhp_filed",label:"RHP filed"},{value:"upcoming",label:"Upcoming"},{value:"open",label:"Open"},{value:"closed",label:"Closed"},{value:"listed",label:"Listed"}]} />
        <Filter label="Year" value={filters.year} onChange={(value) => update("year", value)} options={[{value:"all",label:"All years"}, ...years.map((year) => ({ value: year, label: year }))]} />
        <Filter label="Issue size" value={filters.size} onChange={(value) => update("size", value as Size)} options={[{value:"all",label:"All sizes"},{value:"under100",label:"Under ₹100 Cr"},{value:"100to500",label:"₹100–500 Cr"},{value:"500to1000",label:"₹500–1,000 Cr"},{value:"over1000",label:"Over ₹1,000 Cr"}]} />
        <Filter label="Exchange" value={filters.exchange} onChange={(value) => update("exchange", value as Filters["exchange"])} options={[{value:"all",label:"All exchanges"},{value:"NSE",label:"NSE"},{value:"BSE",label:"BSE"},{value:"NSE_EMERGE",label:"NSE Emerge"},{value:"BSE_SME",label:"BSE SME"}]} />
        {(activeCount > 0 || quickChip !== "all") && <button type="button" className={styles.clearFilters} onClick={reset}>Clear All</button>}
      </div>

      <div className={styles.resultMeta}>
        <p>Showing <strong>{results.length}</strong> verified public issues</p>
        <span>{isMock ? "Development dataset · Indicative values only" : "Database records · Missing fields are never fabricated"}</span>
      </div>

      {results.length ? (
        <>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Board</th>
                  <th>Status</th>
                  <th>Price band</th>
                  <th>Issue size</th>
                  <th>Lot / Min Invest</th>
                  <th>GMP</th>
                  <th>Subscription</th>
                  <th>Open date</th>
                  <th>Listing / gain</th>
                  <th><span className="sr-only">Watchlist</span></th>
                </tr>
              </thead>
              <tbody>{results.map((ipo) => <DesktopRow key={ipo.id} ipo={ipo} />)}</tbody>
            </table>
          </div>
          <div className={styles.mobileResults}>{results.map((ipo) => <MobileResult key={ipo.id} ipo={ipo} />)}</div>
        </>
      ) : (
        <div className={styles.empty}>
          <Search size={24} />
          <h2>{ipos.length ? "No IPOs match these filters" : "Data temporarily unavailable"}</h2>
          <p>{ipos.length ? "Try clearing search queries or adjusting board/issue-size filters." : "No verified IPO records are currently available. The site will not substitute mock values."}</p>
          {ipos.length ? <button type="button" onClick={reset}>Reset directory filters</button> : null}
        </div>
      )}
    </div>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: Array<{value:string;label:string}>; onChange: (value:string)=>void }) {
  return (
    <label className={styles.filterField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function DesktopRow({ ipo }: { ipo: IPO }) {
  const minInvest = ipo.priceBandMax && ipo.lotSize ? ipo.priceBandMax * ipo.lotSize : undefined;
  return (
    <tr>
      <td>
        <Link className={styles.company} href={`/ipo/${ipo.slug}`}>
          <span className={styles.companyIcon}>{ipo.company.name.charAt(0)}</span>
          <div>
            <strong>{ipo.company.name}</strong>
            <small>{ipo.company.industry ?? "Industry not available"}</small>
          </div>
        </Link>
      </td>
      <td>
        <span className={styles.boardBadge}>{formatBoard(ipo.type)}</span>
        <small className={styles.exchanges}>{ipo.exchange.length ? ipo.exchange.join(" · ").replace("_", " ") : "Exchange not announced"}</small>
      </td>
      <td><span className={`${styles.status} ${styles[ipo.status]}`}>{titleCase(ipo.status)}</span></td>
      <td className={styles.numeric}>{formatPriceBand(ipo.priceBandMin, ipo.priceBandMax)}</td>
      <td className={styles.numeric}>{formatCrore(ipo.issueSizeCr)}</td>
      <td className={styles.numeric}>
        {ipo.lotSize ? (
          <>
            <b>{ipo.lotSize} shares</b>
            <small>{minInvest ? formatIndianCurrency(minInvest) : "—"}</small>
          </>
        ) : "—"}
      </td>
      <td className={styles.numeric}><GMPQuote value={ipo.gmp} upperPriceBand={ipo.priceBandMax} updatedAt={ipo.gmpUpdatedAt} /></td>
      <td className={`${styles.numeric} ${styles.bold}`}>{formatSubscription(ipo.subscriptionTotal)}</td>
      <td className={styles.numeric}>{date(ipo.openDate)}</td>
      <td className={styles.numeric}>
        {ipo.listingGainPercent == null ? (
          date(ipo.listingDate)
        ) : (
          <>
            <b>{formatIndianCurrency(ipo.listingPrice)}</b>
            <small className={ipo.listingGainPercent >= 0 ? "financial-up" : "financial-down"}>
              {ipo.listingGainPercent >= 0 ? "+" : ""}{ipo.listingGainPercent.toFixed(1)}%
            </small>
          </>
        )}
      </td>
      <td><WatchlistButton ipoId={ipo.id} compact /></td>
    </tr>
  );
}

function MobileResult({ ipo }: { ipo: IPO }) {
  return (
    <article className={styles.mobileCard}>
      <div className={styles.mobileTitle}>
        <Link href={`/ipo/${ipo.slug}`} className={styles.company}>
          <span className={styles.companyIcon}>{ipo.company.name.charAt(0)}</span>
          <div>
            <strong>{ipo.company.name}</strong>
            <small>{formatBoard(ipo.type)} · {ipo.company.industry ?? "Industry not available"}</small>
          </div>
        </Link>
        <WatchlistButton ipoId={ipo.id} compact />
      </div>
      <div className={styles.mobileState}>
        <span className={`${styles.status} ${styles[ipo.status]}`}>{titleCase(ipo.status)}</span>
        <time>{date(ipo.openDate ?? ipo.latestFilingDate)}</time>
      </div>
      <dl>
        <div><dt>Price band</dt><dd>{formatPriceBand(ipo.priceBandMin, ipo.priceBandMax)}</dd></div>
        <div><dt>Issue size</dt><dd>{formatCrore(ipo.issueSizeCr)}</dd></div>
        <div><dt>GMP</dt><dd><GMPQuote value={ipo.gmp} upperPriceBand={ipo.priceBandMax} updatedAt={ipo.gmpUpdatedAt} /></dd></div>
        <div><dt>Subscribed</dt><dd>{formatSubscription(ipo.subscriptionTotal)}</dd></div>
      </dl>
      <Link className={styles.viewDetail} href={`/ipo/${ipo.slug}`}>
        <span>View IPO details</span>
        <span>→</span>
      </Link>
    </article>
  );
}

