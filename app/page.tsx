import { HomePage } from "@/features/home/home-page";
import { ipoProvider, marketProvider, newsProvider } from "@/lib/providers";

export default async function Home() {
  const results = await Promise.allSettled([
    ipoProvider.getIPOs(),
    marketProvider.getMarketIndices(),
    ipoProvider.getIPOEvents(),
    newsProvider.getNews({ limit: 10 }),
  ]);
  const ipos = results[0].status === "fulfilled" ? results[0].value : [];
  const indices = results[1].status === "fulfilled" ? results[1].value : [];
  const events = results[2].status === "fulfilled" ? results[2].value : [];
  const news = results[3].status === "fulfilled" ? results[3].value : [];
  return <HomePage
    ipos={ipos}
    indices={indices}
    events={events}
    news={news}
    unavailable={{
      ipos: results[0].status === "rejected",
      market: results[1].status === "rejected",
      events: results[2].status === "rejected",
      news: results[3].status === "rejected",
    }}
  />;
}
