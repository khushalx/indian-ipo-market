import type { Metadata } from "next";
import CalendarWorkspace from "@/features/calendar/CalendarWorkspace";
import { ipoProvider } from "@/lib/providers";

export const metadata: Metadata = {
  title: "IPO Calendar",
  description: "Track Indian IPO openings, closings, allotments, listings and DRHP filings.",
  alternates: { canonical: "/calendar" },
};

export default async function CalendarPage() {
  const [ipos, events] = await Promise.all([
    ipoProvider.getIPOs(),
    ipoProvider.getIPOEvents(),
  ]);
  const initialDate = new Date().toISOString().slice(0, 10);

  return <CalendarWorkspace ipos={ipos} events={events} initialDate={initialDate} />;
}
