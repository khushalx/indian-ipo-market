import { MockDocumentsProvider } from "./documents-provider";
import { MockGMPProvider } from "./gmp-provider";
import { MockIPOProvider } from "./ipo-provider";
import { MockMarketProvider } from "./market-provider";
import { MockNewsProvider } from "./news-provider";

export type { DocumentsProvider } from "./documents-provider";
export type { GMPProvider } from "./gmp-provider";
export type { IPOProvider } from "./ipo-provider";
export type { MarketProvider } from "./market-provider";
export type { NewsProvider } from "./news-provider";
export { MockDocumentsProvider, MockGMPProvider, MockIPOProvider, MockMarketProvider, MockNewsProvider };

// Replace these composition roots when verified database/API adapters are introduced.
export const ipoProvider = new MockIPOProvider();
export const marketProvider = new MockMarketProvider();
export const gmpProvider = new MockGMPProvider();
export const newsProvider = new MockNewsProvider();
export const documentsProvider = new MockDocumentsProvider();
