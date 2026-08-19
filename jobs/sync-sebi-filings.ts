import { getRuntimeConfig } from "@/lib/env";
import { SOURCE_PRIORITY } from "@/lib/ingestion/source-priority";
import { IngestionStore } from "@/lib/ingestion/store";
import { SEBIProvider } from "@/lib/providers/sebi";

import { executeJob, ingestRecords, type IngestionTrigger, type JobResult } from "./runtime";
import { SEBI_SOURCE } from "./sources";

export type SyncSEBIFilingsOptions = {
  trigger: IngestionTrigger;
  store?: IngestionStore;
  provider?: Pick<SEBIProvider, "getRecentPublicIssueFilings">;
  force?: boolean;
};

export async function syncSEBIFilings(options: SyncSEBIFilingsOptions): Promise<JobResult> {
  const config = getRuntimeConfig();
  const store = options.store ?? new IngestionStore();
  return executeJob({
    store,
    source: SEBI_SOURCE,
    job: "sync-sebi-filings",
    trigger: options.trigger,
    intervalMinutes: config.SEBI_SYNC_INTERVAL_MINUTES,
    force: options.force,
    enabled: config.SEBI_HTML_INGESTION_ENABLED,
    disabledReason: "SEBI HTML ingestion is permission-gated and disabled",
  }, async (tools) => {
    const provider = options.provider ?? new SEBIProvider();
    const filings = await provider.getRecentPublicIssueFilings();
    await ingestRecords(
      filings,
      tools,
      "store-sebi-filing",
      (filing) => filing.id,
      (filing) => store.ingestFiling(tools.context, filing),
    );
    return { sourcePriority: SOURCE_PRIORITY.sebi };
  });
}

