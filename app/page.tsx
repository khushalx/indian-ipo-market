import { HomePage } from "@/features/home/home-page";
import { ipoProvider, marketProvider, newsProvider } from "@/lib/providers";

export default async function Home() {
  const [ipos, indices, events, news] = await Promise.all([
    ipoProvider.getIPOs(),
    marketProvider.getMarketIndices(),
    ipoProvider.getIPOEvents(),
    newsProvider.getNews({ limit: 10 }),
  ]);
  return <HomePage ipos={ipos} indices={indices} events={events} news={news} />;
}
