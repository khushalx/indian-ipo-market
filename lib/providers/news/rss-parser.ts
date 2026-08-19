import { stripHtml } from "@/lib/ingestion/normalize";

export type ParsedFeedItem = {
  title: string;
  summary: string;
  link?: string;
  guid?: string;
  publishedAt?: string;
  publisher?: string;
  categories: string[];
  imageUrl?: string;
};

export type ParsedFeed = {
  title?: string;
  items: ParsedFeedItem[];
};

export function decodeXML(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, "&");
}

function tagText(fragment: string, names: string[]): string | undefined {
  for (const name of names) {
    const escaped = name.replace(":", "\\:");
    const match = fragment.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
    if (match) {
      const value = stripHtml(decodeXML(match[1]));
      if (value) return value;
    }
  }
  return undefined;
}

function tagAttribute(fragment: string, tagNames: string[], attribute: string): string | undefined {
  for (const name of tagNames) {
    const escaped = name.replace(":", "\\:");
    const match = fragment.match(new RegExp(`<${escaped}\\b[^>]*\\b${attribute}\\s*=\\s*(["'])(.*?)\\1[^>]*>`, "i"));
    if (match?.[2]) return decodeXML(match[2]).trim();
  }
  return undefined;
}

function allTagText(fragment: string, name: string): string[] {
  const escaped = name.replace(":", "\\:");
  const matches = fragment.matchAll(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "gi"));
  return [...matches].map((match) => stripHtml(decodeXML(match[1]))).filter(Boolean);
}

function feedLink(fragment: string): string | undefined {
  return tagAttribute(fragment, ["link"], "href") ?? tagText(fragment, ["link"]);
}

export function parseRSSFeed(xml: string): ParsedFeed {
  const channel = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1] ?? xml;
  const firstItemOffset = channel.search(/<(?:item|entry)\b/i);
  const channelHeader = firstItemOffset >= 0 ? channel.slice(0, firstItemOffset) : channel;
  const feedTitle = tagText(channelHeader, ["title"]);
  const fragments = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ].map((match) => match[1]);

  const items = fragments.map((fragment): ParsedFeedItem | null => {
    const title = tagText(fragment, ["title"]);
    if (!title) return null;
    return {
      title,
      summary: tagText(fragment, ["description", "summary", "content", "content:encoded"]) ?? "",
      link: feedLink(fragment),
      guid: tagText(fragment, ["guid", "id"]),
      publishedAt: tagText(fragment, ["pubDate", "published", "updated", "dc:date"]),
      publisher: tagText(fragment, ["source", "author", "dc:creator"]) ?? feedTitle,
      categories: [...allTagText(fragment, "category"), ...allTagText(fragment, "dc:subject")],
      imageUrl: tagAttribute(fragment, ["media:content", "media:thumbnail", "enclosure"], "url"),
    };
  }).filter((item): item is ParsedFeedItem => Boolean(item));

  return { title: feedTitle, items };
}
