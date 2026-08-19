import type {
  IngestionRunContext,
  IngestionStore,
  RunCounters,
  SourceDefinition,
} from "@/lib/ingestion/store";
import { emptyRunCounters } from "@/lib/ingestion/store";

export type IngestionTrigger = "SCHEDULED" | "MANUAL" | "API" | "RETRY";

export type JobResult = {
  job: string;
  provider: string;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: number;
  startedAt: string;
  finishedAt: string;
  reason?: string;
};

export type JobExecutionOptions = {
  store: IngestionStore;
  source: SourceDefinition;
  job: string;
  trigger: IngestionTrigger;
  intervalMinutes: number;
  force?: boolean;
  enabled?: boolean;
  disabledReason?: string;
};

export type JobTaskTools = {
  context: IngestionRunContext;
  counters: RunCounters;
  count: (outcome: "created" | "updated" | "skipped") => void;
  recordError: (
    operation: string,
    error: unknown,
    options?: Parameters<IngestionStore["logError"]>[3],
  ) => Promise<void>;
};

function toResult(
  options: JobExecutionOptions,
  status: JobResult["status"],
  counters: RunCounters,
  startedAt: Date,
  reason?: string,
): JobResult {
  return {
    job: options.job,
    provider: options.source.key,
    status,
    recordsFetched: counters.fetched,
    recordsCreated: counters.created,
    recordsUpdated: counters.updated,
    recordsSkipped: counters.skipped,
    errors: counters.errors,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    reason,
  };
}

/** Run bookkeeping and provider health are identical across all job types. */
export async function executeJob(
  options: JobExecutionOptions,
  task: (tools: JobTaskTools) => Promise<Record<string, unknown> | void>,
): Promise<JobResult> {
  const counters = emptyRunCounters();
  const context = await options.store.startRun(options.source, options.job, options.trigger);

  if (options.enabled === false) {
    const reason = options.disabledReason ?? "Provider is not configured";
    await options.store.finishRun(context, "SKIPPED", counters, { errorSummary: reason });
    return toResult(options, "SKIPPED", counters, context.startedAt, reason);
  }

  if (!options.force && options.trigger === "SCHEDULED") {
    const due = await options.store.isJobDue(
      options.source.key,
      options.job,
      options.intervalMinutes,
      context.id,
    );
    if (!due) {
      const reason = `Not due for ${options.intervalMinutes} minutes`;
      await options.store.finishRun(context, "SKIPPED", counters, { errorSummary: reason });
      return toResult(options, "SKIPPED", counters, context.startedAt, reason);
    }
  }

  const count = (outcome: "created" | "updated" | "skipped") => {
    if (outcome === "created") counters.created += 1;
    else if (outcome === "updated") counters.updated += 1;
    else counters.skipped += 1;
  };
  const recordError: JobTaskTools["recordError"] = async (operation, error, errorOptions = {}) => {
    counters.errors += 1;
    await options.store.logError(context, operation, error, errorOptions);
  };

  try {
    const metadata = await task({ context, counters, count, recordError });
    const status = counters.errors > 0 ? "PARTIAL" : "SUCCEEDED";
    const summary = counters.errors > 0 ? `${counters.errors} record or provider operation(s) failed` : undefined;
    await options.store.finishRun(context, status, counters, { errorSummary: summary, metadata: metadata ?? undefined });
    return toResult(options, status, counters, context.startedAt, summary);
  } catch (error) {
    await recordError(options.job, error);
    const reason = error instanceof Error ? error.message : String(error);
    await options.store.finishRun(context, "FAILED", counters, { errorSummary: reason });
    return toResult(options, "FAILED", counters, context.startedAt, reason);
  }
}

export async function ingestRecords<T>(
  records: readonly T[],
  tools: JobTaskTools,
  operation: string,
  identifier: (record: T) => string,
  ingest: (record: T) => Promise<"created" | "updated" | "skipped">,
): Promise<void> {
  tools.counters.fetched += records.length;
  for (const record of records) {
    try {
      tools.count(await ingest(record));
    } catch (error) {
      await tools.recordError(operation, error, { rawIdentifier: identifier(record) });
      tools.counters.skipped += 1;
    }
  }
}
