import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IpoDetailPage } from "@/features/ipo-detail/IpoDetailPage";
import {
  documentsProvider,
  gmpProvider,
  ipoProvider,
  newsProvider,
} from "@/lib/providers";
import { formatRupees } from "@/features/ipo-detail/format";
import styles from "@/features/ipo-detail/ipo-detail.module.css";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const ipo = await ipoProvider.getIPOBySlug(slug);
    if (!ipo) {
      return {
        title: "IPO not found",
        robots: { index: false, follow: false },
        openGraph: { images: [] },
        twitter: { images: [] },
      };
    }

    const hasPriceBand = ipo.priceBandMin != null && ipo.priceBandMax != null;
    const title = `${ipo.company.name} IPO: Documents, Dates, GMP & Subscription`;
    const priceBand = hasPriceBand
      ? `price band ${formatRupees(ipo.priceBandMin)}–${formatRupees(ipo.priceBandMax)}`
      : "price band not yet announced";
    const description = `${ipo.company.name} IPO ${priceBand}. View verified dates, source documents, GMP, subscription and available financials.`;

    return {
      title,
      description,
      alternates: { canonical: `/ipo/${ipo.slug}` },
      openGraph: {
        title,
        description,
        type: "article",
        images: [],
      },
      twitter: {
        card: "summary",
        title,
        description,
        images: [],
      },
    };
  } catch {
    return {
      title: "IPO details temporarily unavailable",
      robots: { index: false, follow: false },
      openGraph: { images: [] },
      twitter: { images: [] },
    };
  }
}

export default async function IPOPage({ params }: RouteProps) {
  const { slug } = await params;

  let ipo;
  try {
    ipo = await ipoProvider.getIPOBySlug(slug);
  } catch {
    return (
      <main className={styles.unavailablePage}>
        <p>DATA PROVIDER UNAVAILABLE</p>
        <h1>We couldn&apos;t load this IPO.</h1>
        <span>The underlying provider did not respond. No substitute figures have been shown.</span>
        <Link href="/ipos">Return to IPOs</Link>
      </main>
    );
  }

  if (!ipo) notFound();

  const results = await Promise.allSettled([
    ipoProvider.getIPOFinancials(ipo.id),
    ipoProvider.getSubscription(ipo.id),
    gmpProvider.getGMPHistory(ipo.id),
    documentsProvider.getDocuments(ipo.id),
    newsProvider.getNews({ ipoId: ipo.id, limit: 6 }),
    ipoProvider.getIPOEvents(ipo.id),
    documentsProvider.getPeers(ipo.id),
  ] as const);

  const sectionNames = [
    "Financials",
    "Subscription",
    "GMP",
    "Documents",
    "News",
    "Timeline",
    "Peers",
  ];
  const unavailableSections = results.flatMap((result, index) =>
    result.status === "rejected" ? [sectionNames[index]] : [],
  );

  return (
    <IpoDetailPage
      ipo={ipo}
      financials={results[0].status === "fulfilled" ? results[0].value : []}
      subscriptions={results[1].status === "fulfilled" ? results[1].value : []}
      gmpHistory={results[2].status === "fulfilled" ? results[2].value : []}
      documents={results[3].status === "fulfilled" ? results[3].value : []}
      news={results[4].status === "fulfilled" ? results[4].value : []}
      events={results[5].status === "fulfilled" ? results[5].value : []}
      peers={results[6].status === "fulfilled" ? results[6].value : []}
      unavailableSections={unavailableSections}
    />
  );
}
