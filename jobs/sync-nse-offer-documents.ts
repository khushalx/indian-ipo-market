import { getRuntimeConfig } from "@/lib/env";
import { SOURCE_PRIORITY } from "@/lib/ingestion/source-priority";
import { IngestionStore } from "@/lib/ingestion/store";
import {
  checkNSEDocumentAvailability,
  DOCUMENT_AVAILABILITY_CHECK_CONCURRENCY,
  DOCUMENT_AVAILABILITY_CHECK_LIMIT,
  NSEOfferDocumentsRSSProvider,
  NSE_OFFER_DOCUMENTS_RSS_URL,
  type DocumentAvailabilityResult,
  type NSEOfferDocumentsProvider,
} from "@/lib/providers/nse";
import { feedValidatorsSchema } from "@/lib/providers/news";

import { executeJob, ingestRecords, type IngestionTrigger, type JobResult } from "./runtime";
import { NSE_OFFER_DOCUMENTS_SOURCE } from "./sources";

export type SyncNSEOfferDocumentsOptions = {
  trigger: IngestionTrigger;
  store?: IngestionStore;
  provider?: NSEOfferDocumentsProvider;
  availabilityChecker?: (documentUrl: string) => Promise<DocumentAvailabilityResult>;
  force?: boolean;
};

async function forEachWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await task(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

export async function syncNSEOfferDocuments(options: SyncNSEOfferDocumentsOptions): Promise<JobResult> {
  const config = getRuntimeConfig();
  const store = options.store ?? new IngestionStore();
  const provider = options.provider ?? new NSEOfferDocumentsRSSProvider({
    feedUrl: config.NSE_OFFER_DOCUMENTS_RSS_URL ?? NSE_OFFER_DOCUMENTS_RSS_URL,
  });
  const availabilityChecker = options.availabilityChecker ?? checkNSEDocumentAvailability;

  return executeJob({
    store,
    source: NSE_OFFER_DOCUMENTS_SOURCE,
    job: "sync-nse-offer-documents",
    trigger: options.trigger,
    intervalMinutes: config.NSE_FILINGS_SYNC_INTERVAL_MINUTES,
    force: options.force,
  }, async (tools) => {
    const validators = feedValidatorsSchema.safeParse(tools.context.source.metadata?.feedValidators);
    const response = await provider.getOfferDocuments(validators.success ? validators.data : {});
    await store.updateSourceMetadata(tools.context.sourceId, {
      feedValidators: response.validators,
      lastFeedFetchAt: response.fetchedAt,
      lastNotModifiedAt: response.notModified ? response.fetchedAt : undefined,
    });
    if (!response.notModified) {
      await ingestRecords(
        response.records,
        tools,
        "store-nse-offer-document",
        (filing) => filing.id,
        (filing) => store.ingestFiling(tools.context, filing),
      );
    }

    const availability = {
      checked: 0,
      available: 0,
      notFound: 0,
      unknown: 0,
    };
    const dueDocuments = await store.listDueDocumentAvailabilityChecks(
      tools.context.sourceId,
      DOCUMENT_AVAILABILITY_CHECK_LIMIT,
    );
    await forEachWithConcurrency(
      dueDocuments,
      DOCUMENT_AVAILABILITY_CHECK_CONCURRENCY,
      async (document) => {
        try {
          const result = await availabilityChecker(document.documentUrl);
          await store.updateDocumentAvailability(document.id, result);
          availability.checked += 1;
          if (result.status === "AVAILABLE") availability.available += 1;
          else if (result.status === "NOT_FOUND") availability.notFound += 1;
          else availability.unknown += 1;
        } catch (error) {
          await tools.recordError("check-nse-document-availability", error, {
            entityType: "IPO_DOCUMENT",
            entityId: document.id,
          });
        }
      },
    );
    return {
      notModified: response.notModified,
      fetchedAt: response.fetchedAt,
      sourcePriority: SOURCE_PRIORITY.exchange,
      validators: response.validators,
      documentAvailability: availability,
    };
  });
}
