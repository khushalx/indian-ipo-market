import type { Metadata } from "next";
import { IPOExplorer } from "@/features/ipo-explorer/ipo-explorer";
import { ipoProvider } from "@/lib/providers";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "IPO Directory — Mainboard & SME Issues | Artha IPO",
  description: "Search, filter and compare Indian Mainboard and SME IPOs by status, issue size, GMP, subscription and listing performance.",
};

export default async function IPOsPage() {
  const result = await ipoProvider.getIPOs().then(
    (ipos) => ({ ipos, unavailable: false }),
    () => ({ ipos: [], unavailable: true }),
  );
  const { ipos, unavailable } = result;
  return (
    <main className={`site-container ${styles.page}`}>
      <header className={styles.header}>
        <div><p className="section-kicker">IPO EXPLORER</p><h1>All public issues</h1><p>Research Mainboard and SME IPOs across every stage of the issue lifecycle.</p></div>
        {unavailable ? <div className="mock-badge"><span /> Data temporarily unavailable</div> : ipos.some((ipo) => ipo.mockDisclaimer) ? <div className="mock-badge"><span /> Development data · Not live</div> : <div className="mock-badge"><span /> Official filings · Partial data supported</div>}
      </header>
      <IPOExplorer ipos={ipos} />
    </main>
  );
}
