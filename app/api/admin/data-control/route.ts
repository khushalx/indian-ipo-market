import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AdminActionError, executeAdminDataControl } from "@/lib/admin/actions";
import { isSameOriginAdminPost } from "@/lib/admin/security";
import { adminDataControlSchema } from "@/lib/admin/validation";
import { isAdminEmail } from "@/lib/env";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const user = await requireChatGPTUser("/admin/data-status");
  if (!isAdminEmail(user.email)) {
    return json({ ok: false, code: "FORBIDDEN", message: "This data-control route is not available." }, 403);
  }
  if (!isSameOriginAdminPost(request)) {
    return json({ ok: false, code: "INVALID_ORIGIN", message: "The request did not pass the same-origin check." }, 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return json({ ok: false, code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ ok: false, code: "INVALID_JSON", message: "Send a valid JSON request body." }, 400);
  }
  const parsed = adminDataControlSchema.safeParse(payload);
  if (!parsed.success) {
    return json({
      ok: false,
      code: "INVALID_INPUT",
      message: "Review the submitted fields.",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, 400);
  }

  try {
    const result = await executeAdminDataControl(parsed.data, user, request.url);
    return json(result);
  } catch (error) {
    if (error instanceof AdminActionError) {
      return json({ ok: false, code: error.code, message: error.message }, error.status);
    }
    console.error(JSON.stringify({
      event: "admin_data_control_failed",
      action: parsed.data.action,
      error: error instanceof Error ? error.message : "unknown_error",
    }));
    return json({ ok: false, code: "INTERNAL_ERROR", message: "The data-control action could not be completed." }, 500);
  }
}
