import type { Metadata } from "next";
import { NewsArchive } from "@/features/news/news-archive";
import { ipoProvider, newsProvider } from "@/lib/providers";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "IPO News & Filings", description: "Editorial IPO news, filing updates and listing coverage for India's primary market." };

export default async function NewsPage() {
  const [articles, ipos] = await Promise.all([newsProvider.getNews(), ipoProvider.getIPOs()]);
  return (
    <main className={`site-container ${styles.page}`}>
      <header><div><p className="section-kicker">MARKET DESK</p><h1>IPO news & filings</h1><p>Issue updates, regulatory filings and listing coverage—kept concise and source-aware.</p></div><div className="mock-badge"><span /> Development articles</div></header>
      <NewsArchive articles={articles} ipos={ipos} />
    </main>
  );
}
