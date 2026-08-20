import { MockDocumentsProvider, type DocumentsProvider } from "./documents-provider";
import { MockGMPProvider, type GMPProvider } from "./gmp-provider";
import { MockIPOProvider, type IPOProvider } from "./ipo-provider";
import { MockMarketProvider, type MarketProvider } from "./market-provider";
import { MockNewsProvider, type NewsProvider } from "./news-provider";

export type { DocumentsProvider } from "./documents-provider";
export type { GMPProvider } from "./gmp-provider";
export type { IPOProvider } from "./ipo-provider";
export type { MarketProvider } from "./market-provider";
export type { NewsProvider } from "./news-provider";
export {
  MockDocumentsProvider,
  MockGMPProvider,
  MockIPOProvider,
  MockMarketProvider,
  MockNewsProvider,
};

const mockIPO = new MockIPOProvider();
const mockMarket = new MockMarketProvider();
const mockGMP = new MockGMPProvider();
const mockNews = new MockNewsProvider();
const mockDocuments = new MockDocumentsProvider();

type LiveProviders = {
  ipo: IPOProvider;
  market: MarketProvider;
  gmp: GMPProvider;
  news: NewsProvider;
  documents: DocumentsProvider;
};

let liveProvidersPromise: Promise<LiveProviders> | undefined;

async function dataMode(): Promise<"live" | "mock"> {
  const processMode = typeof process !== "undefined" ? process.env.DATA_MODE : undefined;
  if (processMode === "mock" || processMode === "live") return processMode;
  return (await import("@/lib/env")).getDataMode();
}

async function liveProviders(): Promise<LiveProviders> {
  liveProvidersPromise ??= import("./database").then((database) => ({
    ipo: new database.DatabaseIPOProvider(),
    market: new database.DatabaseMarketProvider(),
    gmp: new database.DatabaseGMPProvider(),
    news: new database.DatabaseNewsProvider(),
    documents: new database.DatabaseDocumentsProvider(),
  }));
  return liveProvidersPromise;
}

async function selected<K extends keyof LiveProviders>(
  key: K,
  mockProvider: LiveProviders[K],
): Promise<LiveProviders[K]> {
  try {
    const mode = await dataMode();
    if (mode === "mock") return mockProvider;
    const providers = await liveProviders();
    return providers[key];
  } catch {
    return mockProvider;
  }
}


/**
 * Runtime-selecting composition roots. Production defaults to normalized D1
 * reads; mock providers are loaded only when DATA_MODE=mock is explicit.
 */
export const ipoProvider: IPOProvider = {
  async getIPOs(...args) {
    return (await selected("ipo", mockIPO)).getIPOs(...args);
  },
  async getIPOBySlug(...args) {
    return (await selected("ipo", mockIPO)).getIPOBySlug(...args);
  },
  async getIPOFinancials(...args) {
    return (await selected("ipo", mockIPO)).getIPOFinancials(...args);
  },
  async getSubscription(...args) {
    return (await selected("ipo", mockIPO)).getSubscription(...args);
  },
  async getIPOEvents(...args) {
    return (await selected("ipo", mockIPO)).getIPOEvents(...args);
  },
  async getShareholding(...args) {
    return (await selected("ipo", mockIPO)).getShareholding(...args);
  },
};

export const marketProvider: MarketProvider = {
  async getMarketIndices(...args) {
    return (await selected("market", mockMarket)).getMarketIndices(...args);
  },
};

export const gmpProvider: GMPProvider = {
  async getGMPHistory(...args) {
    return (await selected("gmp", mockGMP)).getGMPHistory(...args);
  },
};

export const newsProvider: NewsProvider = {
  async getNews(...args) {
    return (await selected("news", mockNews)).getNews(...args);
  },
};

export const documentsProvider: DocumentsProvider = {
  async getDocuments(...args) {
    return (await selected("documents", mockDocuments)).getDocuments(...args);
  },
  async getPeers(...args) {
    return (await selected("documents", mockDocuments)).getPeers(...args);
  },
};
