declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    DATA_MODE?: "live" | "mock";
    IPO_DATA_PROVIDER?: string;
    IPO_API_BASE_URL?: string;
    IPO_API_KEY?: string;
    IPO_API_KEY_HEADER?: string;
    IPO_API_KEY_PREFIX?: string;
    GMP_DATA_PROVIDER?: string;
    GMP_API_BASE_URL?: string;
    GMP_API_KEY?: string;
    GMP_API_KEY_HEADER?: string;
    GMP_API_KEY_PREFIX?: string;
    MARKET_DATA_PROVIDER?: string;
    MARKET_API_BASE_URL?: string;
    MARKET_API_KEY?: string;
    MARKET_API_KEY_HEADER?: string;
    MARKET_API_KEY_PREFIX?: string;
    NEWS_DATA_PROVIDER?: string;
    NEWS_API_BASE_URL?: string;
    NEWS_API_KEY?: string;
    NEWS_API_KEY_HEADER?: string;
    NEWS_API_KEY_PREFIX?: string;
    NSE_RSS_URL?: string;
    NSE_OFFER_DOCUMENTS_RSS_URL?: string;
    SEBI_HTML_INGESTION_ENABLED?: "true" | "false";
    CRON_SECRET?: string;
    ADMIN_EMAILS?: string;
    DATABASE_URL?: string;
  }
}
