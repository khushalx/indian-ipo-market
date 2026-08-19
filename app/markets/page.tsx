import type { Metadata } from "next";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatCrore, formatMarketValue, formatPercent } from "@/lib/format";
import { ipoProvider, marketProvider } from "@/lib/providers";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Markets", description: "Indian market context and primary-market issuance overview." };

export default async function MarketsPage() {
  const [indices, ipos] = await Promise.all([marketProvider.getMarketIndices(), ipoProvider.getIPOs()]);
  const open = ipos.filter((ipo) => ipo.status === "open");
  const pipeline = ipos.filter((ipo) => ipo.status === "upcoming");
  const capital = ipos.reduce((sum, ipo) => sum + ipo.issueSizeCr, 0);
  return (
    <main className={`site-container ${styles.page}`}>
      <header><div><p className="section-kicker">MARKET CONTEXT</p><h1>Indian markets</h1><p>A restrained market snapshot alongside primary issuance activity.</p></div><div className="mock-badge"><span /> Development data · Not live</div></header>
      <section className={styles.indices} aria-label="Market indices">{indices.map((index) => <article key={index.id}><div><span>{index.name}</span>{index.changePercent >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</div><strong>{formatMarketValue(index.value)}</strong><p className={index.changePercent >= 0 ? "financial-up" : "financial-down"}>{index.change >= 0 ? "+" : ""}{formatMarketValue(index.change)} · {formatPercent(index.changePercent,{sign:true,maximumFractionDigits:2})}</p><small>Sample close · {index.source.sourceName}</small></article>)}</section>
      <section className={styles.primary}><div><p className="section-kicker">PRIMARY MARKET</p><h2>Issuance pulse</h2></div><dl><div><dt>Issues tracked</dt><dd>{ipos.length}</dd></div><div><dt>Open now</dt><dd>{open.length}</dd></div><div><dt>Upcoming</dt><dd>{pipeline.length}</dd></div><div><dt>Aggregate issue size</dt><dd>{formatCrore(capital, 0)}</dd></div></dl><Link href="/ipos">Explore the IPO directory <ArrowUpRight size={12} /></Link></section>
      <aside className={styles.note}><strong>Phase 1 scope</strong><p>Broader live market intelligence will arrive in a later phase. This view provides mocked context only; it intentionally avoids pretending to be a live trading terminal.</p></aside>
    </main>
  );
}
