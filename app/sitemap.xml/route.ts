import { ipoProvider } from "@/lib/providers";

const staticRoutes = ["/", "/ipos", "/calendar", "/compare", "/markets", "/news"];

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const ipos = await ipoProvider.getIPOs();
  const urls = [
    ...staticRoutes.map((route) => ({ loc: `${origin}${route}`, priority: route === "/" ? "1.0" : "0.8", modified: "2026-08-19" })),
    ...ipos.map((ipo) => ({ loc: `${origin}/ipo/${ipo.slug}`, priority: "0.9", modified: ipo.source.lastUpdated.slice(0, 10) })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((item) => `  <url><loc>${item.loc}</loc><lastmod>${item.modified}</lastmod><priority>${item.priority}</priority></url>`).join("\n")}
</urlset>`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
