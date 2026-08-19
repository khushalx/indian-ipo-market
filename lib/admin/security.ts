export function isSameOriginAdminPost(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return false;
  if (request.headers.get("x-artha-admin-action") !== "1") return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;

  return origin.host === host && origin.protocol === protocol;
}
