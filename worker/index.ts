/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil((async () => {
      try {
        const [{ ensurePhase2Schema }, { runIngestionSuite }] = await Promise.all([
          import("../db/runtime-migrations"),
          import("../jobs"),
        ]);
        await ensurePhase2Schema(env.DB);
        const result = await runIngestionSuite({ trigger: "SCHEDULED", database: env.DB });
        if (result.status === "FAILED") {
          throw new Error("All attempted scheduled ingestion jobs failed");
        }
        console.info(JSON.stringify({
          event: "scheduled_ingestion_complete",
          status: result.status,
          jobs: result.jobs.map((job) => ({ job: job.job, status: job.status, errors: job.errors })),
        }));
      } catch (error) {
        console.error(JSON.stringify({
          event: "scheduled_ingestion_failed",
          errorType: error instanceof Error ? error.name : "unknown_error",
        }));
        throw error;
      }
    })());
  },
};

export default worker;
