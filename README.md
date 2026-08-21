# Artha IPO

Artha IPO is an Indian primary-market intelligence site. Phase 2 keeps the Phase 1 product UI, but production reads normalized, source-aware records from a persistent database instead of development fixtures.

## Data contract

The production flow is:

```text
official / configured provider
  → server-side adapter
  → Zod validation and normalization
  → conservative company resolution and reconciliation
  → D1 history + provenance tables
  → database read providers
  → server-rendered website
```

Consumer routes never fetch an exchange, regulator, publisher, or market API directly. `DATA_MODE=live` is the default. Live mode does not fall back to mock data when a binding, provider, or field is unavailable.

## Integrated sources

- NSE offer-document RSS is the default recurring official feed. It uses conditional requests, filters non-IPO disclosure rows, and performs capped official-host HEAD checks so a filing remains visible even when NSE has temporarily published a broken document link.
- The public SEBI public-issue filing adapter supports DRHP, updated DRHP, RHP, corrigendum, addendum, abridged prospectus, and final documents. Recurring SEBI HTML ingestion is opt-in because the pages are not a documented API.
- Structured IPO, GMP, market-data, JSON news, and RSS news adapters are configuration-driven. API keys stay server-side.
- GMP remains explicitly unofficial and is stored as timestamped history. Market quotes retain REALTIME, DELAYED, EOD, or UNKNOWN timeliness.

No hidden NSE/BSE endpoints, session spoofing, CAPTCHA handling, proxy rotation, or copied article bodies are used.

## Persistence

The deployed OpenAI Sites runtime uses Cloudflare D1 through the logical `DB` binding. `drizzle/0000_phase2_live_data_foundation.sql` creates the normalized model; `drizzle/0001_document_link_availability.sql` adds non-destructive document reachability state. Together they cover companies/aliases, IPO lifecycles, documents, field provenance, conflicts, manual overrides, GMP and subscription history, financials, listing performance, news, market quotes, raw records, ingestion runs/errors, and provider health.

`db/postgres-schema.ts` is a staged PostgreSQL parity model; it is not the active deployed connection. `DATABASE_URL` is reserved for a future Worker-compatible PostgreSQL adapter.

## Routes

- `/` — database-driven IPO market, filings, events, news, and optional indices
- `/ipos` — partial-record-safe IPO and filing directory
- `/ipo/[slug]` — source-aware lifecycle detail page
- `/calendar` — events derived from filing documents and canonical dates
- `/compare`, `/markets`, `/news` — existing product surfaces backed by database providers
- `/admin/data-status` — protected provider, ingestion, provenance, and override control plane
- `/api/internal/sync` — bearer-protected ingestion endpoint (POST only)

The admin route requires ChatGPT authentication and an email listed in `ADMIN_EMAILS`. With no allowlist it remains unavailable.

## Configuration

Copy `.env.example` to an ignored local environment file and configure only providers you are authorised to use. The minimum recurring official feed requires no key. Set a strong `CRON_SECRET` before using the internal sync endpoint.

Provider-specific endpoint shapes can be adapted without changing frontend contracts. Non-`Authorization` key headers such as `X-API-KEY` are supported through the corresponding `*_API_KEY_HEADER` and `*_API_KEY_PREFIX` variables.

## Scheduling

The Worker exposes a scheduled handler and the deployment config requests a 15-minute trigger. Smart eligibility rules decide whether each source/IPO is due, so slow-changing records are not refreshed at the fastest cadence. Jobs are also individually callable through the `CRON_SECRET`-protected sync route; the bound scheduled handler invokes them directly without exposing that secret.

## Development

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

