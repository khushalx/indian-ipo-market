"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import type { IPO, NewsArticle, NewsCategory } from "@/types";
import styles from "./news-archive.module.css";

const categories: Array<{ value: "all" | NewsCategory; label: string }> = [
  { value: "all", label: "All" }, { value: "ipo", label: "IPO" }, { value: "listing", label: "Listings" }, { value: "regulation", label: "Regulation" }, { value: "markets", label: "Markets" }, { value: "results", label: "Results" },
];

export function NewsArchive({ articles, ipos }: { articles: NewsArticle[]; ipos: IPO[] }) {
  const [category, setCategory] = useState<"all" | NewsCategory>("all");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => articles.filter((item) => (category === "all" || item.category === category) && `${item.headline} ${item.summary}`.toLowerCase().includes(query.toLowerCase())), [articles, category, query]);
  const routeFor = (item: NewsArticle) => {
    const ipo = ipos.find((entry) => entry.id === item.ipoId);
    return ipo ? `/ipo/${ipo.slug}#news` : "/news";
  };

  return (
    <div>
      <div className={styles.controls}>
        <div className={styles.tabs} role="group" aria-label="News category">{categories.map((item) => <button key={item.value} aria-pressed={category === item.value} className={category === item.value ? styles.active : undefined} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div>
        <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search headlines" aria-label="Search news" /></label>
      </div>
      <div className={styles.list}>
        {visible.length ? visible.map((item, index) => (
          <article key={item.id} className={index === 0 ? styles.lead : undefined}>
            <div><span>{item.category}</span><time>{formatDate(item.publishedAt, "medium")}</time></div>
            <Link href={routeFor(item)}>{item.headline}</Link>
            <p>{item.summary}</p>
            <small>{item.source.sourceName} · Development article</small>
          </article>
        )) : <div className={styles.empty}><h2>No news found</h2><p>Try another category or a shorter search.</p></div>}
      </div>
    </div>
  );
}
