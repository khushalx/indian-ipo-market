# Artha IPO

Phase 1 foundation for a premium Indian IPO and primary-market intelligence product. The application is intentionally powered by structured development fixtures—no live exchange scraping or investment recommendations are present.

## Product routes

- `/` — active IPO-market homepage, market strip, activity, calendar preview and news
- `/ipos` — searchable, filterable and sortable Mainboard/SME IPO directory
- `/ipo/[slug]` — GMP, subscription, financials, valuation, company, proceeds, timeline, documents and news
- `/calendar` — month and timeline IPO-event views
- `/compare` — comparison for up to three IPOs
- `/markets` — Phase 1 market-context view
- `/news` — searchable editorial archive

## Architecture

The UI reads through provider contracts in `lib/providers/`. `MockIPOProvider`, `MockMarketProvider`, `MockGMPProvider`, `MockNewsProvider` and `MockDocumentsProvider` currently implement those contracts using the fixtures in `data/mock-ipo-data.ts`.

To introduce live sources later, add verified provider implementations and replace only the singleton composition roots in `lib/providers/index.ts`. Components and routes do not import fixture arrays directly.

Domain types live in `types/market.ts`. Shared Indian-market formatters live in `lib/format.ts`. Device-local watchlists are validated with Zod and stored under `artha-watchlist-v1`; the `WatchlistItem` model and PostgreSQL schema leave room for authenticated sync later.

`db/postgres-schema.ts` is a PostgreSQL-ready Drizzle schema designed for Neon or Supabase. It models source attribution, companies, IPOs, events, financials, subscription records, GMP history, documents, peers, shareholding, news, indices and watchlists. The starter D1 surface is deliberately left separate because Phase 1 has no server-side persistence requirement.

## Development data

The dataset contains 12 plausible fictional/development IPO records spanning Mainboard, SME, upcoming, open, closed and listed issues. Important product surfaces label this data as not live. Mock source URLs use `example.com`; no values should be treated as market information.

## Commands

```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm test
```

Node.js 22.13 or later is required.
