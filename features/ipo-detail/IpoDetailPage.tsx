import { Calculator } from "lucide-react";
import { IPOCalculator } from "@/components/ipo-calculator";
import type {
  IPO,
  IPODocument,
  IPOEvent,
  IPOFinancial,
  IPOGMPRecord,
  IPOPeer,
  IPOSubscription,
  NewsArticle,
} from "@/types";
import {
  CompanySection,
  DocumentsSection,
  NewsSection,
  ObjectsSection,
  OverviewSection,
  TimelineSection,
} from "./CompanySections";
import { DetailHeader } from "./DetailHeader";
import {
  FinancialsSection,
  GMPSection,
  SubscriptionSection,
  ValuationSection,
} from "./MarketDataSections";
import styles from "./ipo-detail.module.css";

export type IpoDetailPageProps = {
  ipo: IPO;
  financials: IPOFinancial[];
  subscriptions: IPOSubscription[];
  gmpHistory: IPOGMPRecord[];
  documents: IPODocument[];
  news: NewsArticle[];
  events: IPOEvent[];
  peers: IPOPeer[];
  unavailableSections?: string[];
};

const navigation = [
  ["overview", "Overview"],
  ["calculator", "Calculator"],
  ["gmp", "GMP"],
  ["subscription", "Subscription"],
  ["financials", "Financials"],
  ["valuation", "Valuation"],
  ["company", "Company"],
  ["timeline", "Timeline"],
  ["documents", "Documents"],
  ["news", "News"],
] as const;

export function IpoDetailPage({
  ipo,
  financials,
  subscriptions,
  gmpHistory,
  documents,
  news,
  events,
  peers,
  unavailableSections = [],
}: IpoDetailPageProps) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${ipo.company.name} IPO`,
    description: ipo.company.overview,
    about: {
      "@type": "Organization",
      name: ipo.company.legalName,
      url: ipo.company.website,
      address: ipo.company.headquarters,
    },
    dateModified: ipo.source.lastUpdated,
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DetailHeader ipo={ipo} documents={documents} />
      </div>

      <nav className={styles.sectionNav} aria-label="On this IPO page">
        <div className={styles.navInner}>
          {navigation.map(([id, label]) => (
            <a href={`#${id}`} key={id}>{label}</a>
          ))}
        </div>
      </nav>

      <div className={styles.shell}>
        {unavailableSections.length ? (
          <div className={styles.providerNotice} role="status">
            <strong>Some provider data is temporarily unavailable.</strong>
            <span>
              {unavailableSections.join(", ")} sections may be incomplete; available verified data is shown below.
            </span>
          </div>
        ) : null}

        <OverviewSection ipo={ipo} />

        <section id="calculator" className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>INVESTMENT SIMULATION</p>
              <h2>IPO lot &amp; return calculator</h2>
              <p>Estimate minimum bid amounts, lot sizing, and potential listing gains based on prevailing GMP.</p>
            </div>
          </div>
          <IPOCalculator ipo={ipo} />
        </section>

        <GMPSection ipo={ipo} gmpHistory={gmpHistory} />
        <SubscriptionSection subscriptions={subscriptions} />
        <FinancialsSection financials={financials} />
        <ValuationSection ipo={ipo} financials={financials} peers={peers} />
        <CompanySection ipo={ipo} />
        <ObjectsSection ipo={ipo} />
        <TimelineSection events={events} />
        <DocumentsSection documents={documents} />
        <NewsSection news={news} />

        <footer className={styles.disclaimer}>
          <strong>Important information</strong>
          <p>
            Market data is provided for informational purposes only and does not constitute investment advice. Grey Market Premium is unofficial market information. Verify all figures against SEBI, exchange and issuer filings before acting.
          </p>
        </footer>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}

