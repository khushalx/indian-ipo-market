import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ipoProvider, newsProvider } from "@/lib/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

async function requestBase() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return new URL(`${protocol}://${host}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = await requestBase();
  const image = new URL("/og.png", metadataBase).toString();
  const title = "Artha IPO — Indian IPO Intelligence";
  const description = "Detailed IPO data, GMP history, subscriptions, financials, valuations and timelines for Indian investors.";
  return {
    metadataBase,
    title: { default: title, template: "%s | Artha IPO" },
    description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", title, description, url: "/", siteName: "Artha IPO", locale: "en_IN", images: [{ url: image, width: 1734, height: 907, alt: "Artha IPO — Indian primary market intelligence" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [ipoResult, newsResult] = await Promise.allSettled([ipoProvider.getIPOs(), newsProvider.getNews({ limit: 12 })]);
  const ipos = ipoResult.status === "fulfilled" ? ipoResult.value : [];
  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  return (
    <html lang="en-IN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader
          ipos={ipos.map((ipo) => ({ id: ipo.id, slug: ipo.slug, name: ipo.company.name, industry: ipo.company.industry ?? "Industry not available", status: ipo.status, type: ipo.type }))}
          news={news.map((item) => ({ id: item.id, headline: item.headline, category: item.category, company: ipos.find((ipo) => ipo.id === item.ipoId)?.company.name, ipoSlug: ipos.find((ipo) => ipo.id === item.ipoId)?.slug }))}
        />
        <div id="main-content">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
