"use client";

import {
  Bookmark,
  CalendarDays,
  Command,
  GitCompareArrows,
  Menu,
  Newspaper,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWatchlist } from "@/lib/use-watchlist";
import styles from "./site-header.module.css";

export type HeaderIPO = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  status: string;
  type: string;
};

export type HeaderNews = {
  id: string;
  headline: string;
  category: string;
  company?: string;
  ipoSlug?: string;
};

type Props = { ipos: HeaderIPO[]; news: HeaderNews[] };

const navItems = [
  { href: "/ipos", label: "IPOs", icon: TrendingUp },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/markets", label: "Markets", icon: TrendingUp },
  { href: "/news", label: "News", icon: Newspaper },
];

export function SiteHeader({ ipos, news }: Props) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { ids: saved, remove: removeSaved } = useWatchlist();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setWatchlistOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [searchOpen]);

  const normalized = query.trim().toLowerCase();
  const ipoResults = useMemo(
    () => ipos.filter((ipo) => `${ipo.name} ${ipo.industry} ${ipo.type}`.toLowerCase().includes(normalized)).slice(0, 6),
    [ipos, normalized],
  );
  const newsResults = useMemo(
    () => news.filter((item) => `${item.headline} ${item.company ?? ""} ${item.category}`.toLowerCase().includes(normalized)).slice(0, 4),
    [news, normalized],
  );
  const savedIPOs = ipos.filter((ipo) => saved.includes(ipo.id));

  return (
    <>
      <header className={styles.header}>
        <div className={`site-container ${styles.inner}`}>
          <Link href="/" className={styles.wordmark} aria-label="Artha IPO home">
            <span className={styles.mark} aria-hidden="true">अ</span>
            <span>ARTHA</span>
          </Link>

          <nav className={styles.desktopNav} aria-label="Primary navigation">
            {navItems.map(({ href, label }) => {
              const active = pathname === href || (href === "/ipos" && pathname.startsWith("/ipo/"));
              return <Link key={href} href={href} className={active ? styles.active : undefined}>{label}</Link>;
            })}
          </nav>

          <div className={styles.actions}>
            <button className={styles.searchButton} onClick={() => setSearchOpen(true)} aria-label="Search IPOs, companies and news">
              <Search size={15} aria-hidden="true" />
              <span>Search</span>
              <kbd><Command size={10} />K</kbd>
            </button>
            <button className={styles.watchButton} onClick={() => setWatchlistOpen(true)} aria-label={`Open watchlist with ${saved.length} items`}>
              <Bookmark size={15} aria-hidden="true" />
              <span>Watchlist</span>
              {saved.length > 0 && <b>{saved.length}</b>}
            </button>
            <button className={styles.menuButton} onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-label="Toggle navigation">
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className={styles.mobileNav} aria-label="Mobile navigation">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                <Icon size={16} aria-hidden="true" /><span>{label}</span>
              </Link>
            ))}
          </nav>
        )}
      </header>

      {searchOpen && (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <section className={styles.commandPanel} role="dialog" aria-modal="true" aria-label="Search">
            <div className={styles.searchField}>
              <Search size={18} aria-hidden="true" />
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search an IPO, company or headline…" aria-label="Search" />
              <button onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={17} /></button>
            </div>
            <div className={styles.results}>
              <p className={styles.groupLabel}>IPOs</p>
              {ipoResults.length ? ipoResults.map((ipo) => (
                <Link key={ipo.id} href={`/ipo/${ipo.slug}`} onClick={() => setSearchOpen(false)} className={styles.resultRow}>
                  <span className={styles.initial}>{ipo.name.charAt(0)}</span>
                  <span><strong>{ipo.name}</strong><small>{ipo.type} · {ipo.industry}</small></span>
                  <em>{ipo.status}</em>
                </Link>
              )) : <p className={styles.empty}>No IPOs match that search.</p>}
              {newsResults.length > 0 && <p className={styles.groupLabel}>News</p>}
              {newsResults.map((item) => (
                <Link key={item.id} href={item.ipoSlug ? `/ipo/${item.ipoSlug}#news` : "/news"} onClick={() => setSearchOpen(false)} className={styles.newsResult}>
                  <small>{item.category}</small><strong>{item.headline}</strong>
                </Link>
              ))}
            </div>
            <footer className={styles.commandFooter}><span>Tab to navigate results</span><span>Esc to close</span></footer>
          </section>
        </div>
      )}

      {watchlistOpen && (
        <div className={styles.drawerOverlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setWatchlistOpen(false); }}>
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Your IPO watchlist">
            <div className={styles.drawerHeader}>
              <div><p>WATCHLIST</p><h2>Following {savedIPOs.length} IPO{savedIPOs.length === 1 ? "" : "s"}</h2></div>
              <button onClick={() => setWatchlistOpen(false)} aria-label="Close watchlist"><X size={18} /></button>
            </div>
            <div className={styles.drawerBody}>
              {savedIPOs.length ? savedIPOs.map((ipo) => (
                <div className={styles.savedRow} key={ipo.id}>
                  <Link href={`/ipo/${ipo.slug}`} onClick={() => setWatchlistOpen(false)}>
                    <strong>{ipo.name}</strong><small>{ipo.status} · {ipo.type}</small>
                  </Link>
                  <button onClick={() => removeSaved(ipo.id)} aria-label={`Remove ${ipo.name} from watchlist`}><X size={14} /></button>
                </div>
              )) : (
                <div className={styles.emptyWatch}>
                  <Bookmark size={22} aria-hidden="true" />
                  <h3>Your watchlist is empty</h3>
                  <p>Follow an IPO to keep it close while you review dates, GMP and subscription updates.</p>
                  <Link href="/ipos" onClick={() => setWatchlistOpen(false)}>Explore IPOs</Link>
                </div>
              )}
            </div>
            <p className={styles.localNote}>Saved on this device for now.</p>
          </aside>
        </div>
      )}
    </>
  );
}
