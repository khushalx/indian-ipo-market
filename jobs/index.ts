import { IngestionStore } from "@/lib/ingestion/store";

import type { IngestionTrigger, JobResult } from "./runtime";
import { syncGMP } from "./sync-gmp";
import { syncIPODetails } from "./sync-ipo-details";
import { syncListedPerformance } from "./sync-listed-performance";
import { syncMarketIndices } from "./sync-market-indices";
import { syncNews } from "./sync-news";
import { syncNSEOfferDocuments } from "./sync-nse-offer-documents";
import { syncSEBIFilings } from "./sync-sebi-filings";
import { syncSubscriptions } from "./sync-subscriptions";

export type IngestionJobName =
  | "nse-offer-documents"
  | "sebi-filings"
  | "ipo-details"
  | "gmp"
  | "subscriptions"
  | "news"
  | "market-indices"
  | "listed-performance";

export type RunIngestionSuiteOptions = {
  trigger: IngestionTrigger;
  only?: IngestionJobName[];
  force?: boolean;
  database?: D1Database;
};

export type IngestionSuiteResult = {
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  startedAt: string;
  finishedAt: string;
  jobs: JobResult[];
};

const allJobs: IngestionJobName[] = [
  "nse-offer-documents",
  "sebi-filings",
  "ipo-details",
  "gmp",
  "subscriptions",
  "news",
  "market-indices",
  "listed-performance",
];

/** Stable entry point for the authenticated sync route and Worker scheduler. */
export async function runIngestionSuite(options: RunIngestionSuiteOptions): Promise<IngestionSuiteResult> {
  const startedAt = new Date().toISOString();
  const store = new IngestionStore({ database: options.database });
  await store.assertReady();
  const selected = new Set(options.only?.length ? options.only : allJobs);
  const runners: Record<IngestionJobName, () => Promise<JobResult>> = {
    "nse-offer-documents": () => syncNSEOfferDocuments({ ...options, store }),
    "sebi-filings": () => syncSEBIFilings({ ...options, store }),
    "ipo-details": () => syncIPODetails({ ...options, store }),
    gmp: () => syncGMP({ ...options, store }),
    subscriptions: () => syncSubscriptions({ ...options, store }),
    news: () => syncNews({ ...options, store }),
    "market-indices": () => syncMarketIndices({ ...options, store }),
    "listed-performance": () => syncListedPerformance({ ...options, store }),
  };

  // Jobs isolate their own provider and record failures. Running them in
  // parallel prevents one slow optional feed from blocking official filings.
  const settled = await Promise.allSettled(
    allJobs.filter((job) => selected.has(job)).map((job) => runners[job]()),
  );
  const jobs: JobResult[] = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const job = allJobs.filter((candidate) => selected.has(candidate))[index];
    const timestamp = new Date().toISOString();
    return {
      job,
      provider: "runtime",
      status: "FAILED",
      recordsFetched: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: 1,
      startedAt,
      finishedAt: timestamp,
      reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  const attempted = jobs.filter((job) => job.status !== "SKIPPED");
  const status = attempted.length === 0
    ? "SKIPPED"
    : attempted.every((job) => job.status === "SUCCEEDED")
      ? "SUCCEEDED"
      : attempted.every((job) => job.status === "FAILED")
        ? "FAILED"
        : "PARTIAL";
  return { status, startedAt, finishedAt: new Date().toISOString(), jobs };
}

export {
  syncGMP,
  syncIPODetails,
  syncListedPerformance,
  syncMarketIndices,
  syncNews,
  syncNSEOfferDocuments,
  syncSEBIFilings,
  syncSubscriptions,
};
export type { IngestionTrigger, JobResult } from "./runtime";
