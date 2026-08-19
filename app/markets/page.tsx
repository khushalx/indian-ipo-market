import type { Metadata } from "next";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatCrore, formatMarketValue, formatPercent } from "@/lib/format";
import { ipoProvider, marketProvider } from "@/lib/providers";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Markets", description: "Indian market context and primary-market issuance overview." };

export default async function MarketsPage() {
  const results = await Promise.allSettled([marketProvider.getMarketIndices(), ipoProvider.getIPOs()]);
  const indices = results[0].status === "fulfilled" ? results[0].value : [];
  const ipos = results[1].status === "fulfilled" ? results[1].value : [];
  const marketUnavailable = results[0].status === "rejected";
  const ipoUnavailable = results[1].status === "rejected";
  const open = ipos.filter((ipo) => ipo.status === "open");
  const pipeline = ipos.filter((ipo) => ipo.status === "upcoming");
  const capital = ipos.reduce((sum, ipo) => sum + (ipo.issueSizeCr ?? 0), 0);
  return (
    <main className={`site-container ${styles.page}`}>
      <header><div><p className="section-kicker">MARKET CONTEXT</p><h1>Indian markets</h1><p>A restrained market snapshot alongside primary issuance activity.</p></div>{marketUnavailable ? <div className="mock-badge"><span /> Data temporarily unavailable</div> : indices.some((index) => index.mockDisclaimer) ? <div className="mock-badge"><span /> Development data · Not live</div> : <div className="mock-badge"><span /> Feed status shown per quote</div>}</header>
      <section className={styles.indices} aria-label="Market indices">{indices.length ? indices.map((index) => <article key={index.id}><div><span>{index.name}</span>{index.changePercent >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</div><strong>{formatMarketValue(index.value)}</strong><p className={index.changePercent >= 0 ? "financial-up" : "financial-down"}>{index.change >= 0 ? "+" : ""}{formatMarketValue(index.change)} · {formatPercent(index.changePercent,{sign:true,maximumFractionDigits:2})}</p><small>{index.timeliness ?? "UNKNOWN"}{index.delayMinutes != null ? ` ${index.delayMinutes}m` : ""} · {index.source.sourceName}</small></article>) : <article><div><span>{marketUnavailable ? "Market data temporarily unavailable" : "Market feed unavailable"}</span></div><strong>—</strong><p>{marketUnavailable ? "The database-backed quote feed could not be read." : "No authorised quote provider is configured."}</p><small>No values have been substituted.</small></article>}</section>
      <section className={styles.primary}><div><p className="section-kicker">PRIMARY MARKET</p><h2>Issuance pulse</h2></div><dl><div><dt>Issues tracked</dt><dd>{ipoUnavailable ? "—" : ipos.length}</dd></div><div><dt>Open now</dt><dd>{ipoUnavailable ? "—" : open.length}</dd></div><div><dt>Upcoming</dt><dd>{ipoUnavailable ? "—" : pipeline.length}</dd></div><div><dt>Aggregate issue size</dt><dd>{ipoUnavailable ? "Not available" : formatCrore(capital, 0)}</dd></div></dl><Link href="/ipos">Explore the IPO directory <ArrowUpRight size={12} /></Link></section>
      <aside className={styles.note}><strong>Market-data scope</strong><p>Quotes are shown only when an authorised provider supplies them. Delayed and end-of-day values are labelled; unavailable feeds never fall back to fabricated prices.</p></aside>
    </main>
  );
}
