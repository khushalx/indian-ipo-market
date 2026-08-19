import { ensurePhase2Schema } from "@/db/runtime-migrations";
import { runIngestionSuite, type IngestionJobName } from "@/jobs";
import { getRuntimeConfig } from "@/lib/env";
import { z } from "zod";

export const dynamic = "force-dynamic";

const publicJobNames = [
  "all",
  "sync-nse-offer-documents",
  "sync-sebi-filings",
  "sync-ipo-details",
  "sync-gmp",
  "sync-subscriptions",
  "sync-news",
  "sync-market",
  "sync-listed-performance",
] as const;

type PublicJobName = (typeof publicJobNames)[number];

const jobMap: Record<Exclude<PublicJobName, "all">, IngestionJobName> = {
  "sync-nse-offer-documents": "nse-offer-documents",
  "sync-sebi-filings": "sebi-filings",
  "sync-ipo-details": "ipo-details",
  "sync-gmp": "gmp",
  "sync-subscriptions": "subscriptions",
  "sync-news": "news",
  "sync-market": "market-indices",
  "sync-listed-performance": "listed-performance",
};

const publicJobSchema = z.enum(publicJobNames);
const syncRequestSchema = z.union([
  z.object({ job: publicJobSchema }).strict(),
  z.object({ only: z.array(publicJobSchema.exclude(["all"])).min(1).max(8) }).strict(),
]);

function response(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function selectedJobs(payload: z.infer<typeof syncRequestSchema>): IngestionJobName[] | undefined {
  if ("job" in payload) {
    return payload.job === "all" ? undefined : [jobMap[payload.job]];
  }
  return [...new Set(payload.only.map((job) => jobMap[job]))];
}

export async function POST(request: Request) {
  const configuredSecret = getRuntimeConfig().CRON_SECRET;
  if (!configuredSecret) {
    return response({ ok: false, code: "SYNC_NOT_CONFIGURED" }, 503);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!suppliedSecret || !(await constantTimeEqual(suppliedSecret, configuredSecret))) {
    return response({ ok: false, code: "UNAUTHORIZED" }, 401);
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return response({ ok: false, code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return response({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 4_096) return response({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
    payload = JSON.parse(body);
  } catch {
    return response({ ok: false, code: "INVALID_JSON" }, 400);
  }
  const parsed = syncRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return response({ ok: false, code: "INVALID_JOB_SELECTION" }, 400);
  }

  try {
    await ensurePhase2Schema();
    const result = await runIngestionSuite({
      trigger: "API",
      only: selectedJobs(parsed.data),
      force: true,
    });
    const safeResult = {
      status: result.status,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      jobs: result.jobs.map((job) => ({
        job: job.job,
        provider: job.provider,
        status: job.status,
        recordsFetched: job.recordsFetched,
        recordsCreated: job.recordsCreated,
        recordsUpdated: job.recordsUpdated,
        recordsSkipped: job.recordsSkipped,
        errors: job.errors,
      })),
    };
    const status = result.status === "FAILED" ? 503 : result.status === "PARTIAL" ? 207 : 200;
    return response({ ok: result.status !== "FAILED", result: safeResult }, status);
  } catch (error) {
    console.error(JSON.stringify({
      event: "internal_sync_failed",
      errorType: error instanceof Error ? error.name : "unknown_error",
    }));
    return response({ ok: false, code: "SYNC_FAILED" }, 500);
  }
}
