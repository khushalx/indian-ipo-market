import type { Metadata } from "next";
import CalendarWorkspace from "@/features/calendar/CalendarWorkspace";
import { ipoProvider } from "@/lib/providers";
import { istDateKey } from "@/lib/ingestion/market-calendar";

export const metadata: Metadata = {
  title: "IPO Calendar",
  description: "Track Indian IPO openings, closings, allotments, listings and DRHP filings.",
  alternates: { canonical: "/calendar" },
};

export default async function CalendarPage() {
  const results = await Promise.allSettled([
    ipoProvider.getIPOs(),
    ipoProvider.getIPOEvents(),
  ]);
  const ipos = results[0].status === "fulfilled" ? results[0].value : [];
  const events = results[1].status === "fulfilled" ? results[1].value : [];
  const dataUnavailable = results.some((result) => result.status === "rejected");
  const initialDate = istDateKey();

  return (
    <CalendarWorkspace
      ipos={ipos}
      events={events}
      initialDate={initialDate}
      isMock={ipos.some((ipo) => ipo.mockDisclaimer)}
      dataUnavailable={dataUnavailable}
    />
  );
}
