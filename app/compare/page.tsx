import type { Metadata } from "next";
import IPOCompare from "@/features/compare/IPOCompare";
import { ipoProvider } from "@/lib/providers";

export const metadata: Metadata = {
  title: "Compare IPOs",
  description: "Compare Indian IPO issue details, demand, financials, valuation and promoter ownership.",
  alternates: { canonical: "/compare" },
};

interface ComparePageProps {
  searchParams: Promise<{ ipos?: string | string[] }>;
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const ipos = await ipoProvider.getIPOs();
  const financials = (await Promise.all(ipos.map((ipo) => ipoProvider.getIPOFinancials(ipo.id)))).flat();
  const openWithFinancials = ipos.filter(
    (ipo) => ipo.status === "open" && financials.some((row) => row.ipoId === ipo.id),
  );
  const fallbackSelection = (openWithFinancials.length >= 2 ? openWithFinancials : ipos.filter((ipo) => ipo.status === "open"))
    .slice(0, 2)
    .map((ipo) => ipo.id);
  const queryValues = params.ipos ? (Array.isArray(params.ipos) ? params.ipos : [params.ipos]) : [];
  const requestedSlugs = queryValues.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const requestedSelection = requestedSlugs
    .map((slug) => ipos.find((ipo) => ipo.slug === slug)?.id)
    .filter((id): id is string => Boolean(id))
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, 3);
  const defaultSelection = requestedSelection.length ? requestedSelection : fallbackSelection;

  return <IPOCompare key={defaultSelection.join(":")} ipos={ipos} financials={financials} defaultSelection={defaultSelection} />;
}
