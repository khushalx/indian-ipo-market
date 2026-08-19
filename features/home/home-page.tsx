import { ArrowUpRight, CalendarClock, FileText, Landmark, ListChecks } from "lucide-react";
import Link from "next/link";
import { formatBoard, formatDate, formatDateTime, formatMarketValue } from "@/lib/format";
import type { IPO, IPOEvent, MarketIndex, NewsArticle } from "@/types";
import { IPOMarketTable } from "./ipo-market-table";
import styles from "./home-page.module.css";

type Props = {
  ipos: IPO[];
  indices: MarketIndex[];
  events: IPOEvent[];
  news: NewsArticle[];
  unavailable?: { ipos?: boolean; market?: boolean; events?: boolean; news?: boolean };
};
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });

function date(value: string) { return formatDate(value.slice(0, 10), "short"); }
function day(value: string) { return dayFmt.format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`)); }

export function HomePage({ ipos, indices, events, news, unavailable = {} }: Props) {
  const open = ipos.filter((ipo) => ipo.status === "open");
  const upcoming = ipos.filter((ipo) => ipo.status === "upcoming");
  const closing = [...open].sort((a, b) => (a.closeDate ?? "").localeCompare(b.closeDate ?? ""))[0];
  const recentlyListed = ipos.filter((ipo) => ipo.status === "listed").sort((a, b) => (b.listingDate ?? "").localeCompare(a.listingDate ?? "")).slice(0, 3);
  const newFilings = ipos.filter((ipo) => ipo.latestFilingDate || ipo.status === "drhp_filed" || ipo.status === "rhp_filed").sort((a, b) => (b.latestFilingDate ?? "").localeCompare(a.latestFilingDate ?? "")).slice(0, 3);
  const calendar = events.filter((event) => event.state !== "completed").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  const ipoName = (id: string) => ipos.find((ipo) => ipo.id === id)?.company.name ?? "IPO";
  const isMock = ipos.some((ipo) => ipo.mockDisclaimer) || indices.some((index) => index.mockDisclaimer);
  const dataAsOf = [...ipos.map((ipo) => ipo.updatedAt ?? ipo.source.lastUpdated), ...indices.map((index) => index.asOf)].filter(Boolean).sort().at(-1);

  return (
    <main>
      <section className={styles.marketStrip} aria-label="Market snapshot">
        <div className={`site-container ${styles.marketInner}`}>
          <span className={styles.marketLabel}>MARKETS</span>
          {indices.length ? indices.map((index) => (
            <div className={styles.index} key={index.id}>
              <span>{index.name}</span><strong>{formatMarketValue(index.value)}</strong><em className={index.changePercent >= 0 ? "financial-up" : "financial-down"}>{index.changePercent >= 0 ? "+" : ""}{index.changePercent.toFixed(2)}%</em>
            </div>
          )) : <span className={styles.marketTime}>{unavailable.market ? "Market data temporarily unavailable" : "Market feed unavailable"}</span>}
          {indices.length ? <span className={styles.marketTime}>Source: {Array.from(new Set(indices.map((index) => index.source.sourceName))).join(" · ")} · {Array.from(new Set(indices.map((index) => index.timeliness ?? "UNKNOWN"))).join(" · ")} · {formatDateTime(indices[0]?.asOf)}</span> : null}
        </div>
      </section>

      <section className={`site-container ${styles.intro}`}>
        <div>
          <p className="section-kicker">PRIMARY MARKET INTELLIGENCE</p>
          <h1>IPO Market</h1>
          <p>India&apos;s public issues, from filing to listing—organised for decisions, not noise.</p>
        </div>
        {unavailable.ipos ? <div className="mock-badge"><span /> Data temporarily unavailable</div> : isMock ? <div className="mock-badge"><span /> Development data · Not live</div> : <div className="mock-badge"><span /> Source-aware data · {dataAsOf ? formatDate(dataAsOf, "medium") : "Availability varies"}</div>}
      </section>

      <section className={`site-container ${styles.marketSection}`} aria-labelledby="market-table-title">
        <div className="sr-only"><h2 id="market-table-title">IPO market table</h2></div>
        <IPOMarketTable ipos={ipos} />
      </section>

      <section className={`site-container ${styles.activity}`} aria-labelledby="activity-title">
        <div className={styles.sectionHead}><div><p className="section-kicker">AT A GLANCE</p><h2 id="activity-title">IPO activity</h2></div><span>{unavailable.ipos ? "Data temporarily unavailable" : dataAsOf ? `Updated ${formatDateTime(dataAsOf)}` : "No verified records yet"}</span></div>
        <div className={styles.activityGrid}>
          <article>
            <Landmark size={16} aria-hidden="true" />
            <p>OPEN NOW</p><strong>{open.length}</strong><span>public issues accepting bids</span>
            <div>{open.slice(0, 2).map((ipo) => <Link key={ipo.id} href={`/ipo/${ipo.slug}`}>{ipo.company.name}<ArrowUpRight size={11} /></Link>)}</div>
          </article>
          <article>
            <CalendarClock size={16} aria-hidden="true" />
            <p>CLOSING SOON</p><strong>{closing ? date(closing.closeDate!) : "—"}</strong><span>{closing?.company.name ?? "No active close"}</span>
            {closing && <div><Link href={`/ipo/${closing.slug}`}>View bidding details <ArrowUpRight size={11} /></Link></div>}
          </article>
          <article>
            <ListChecks size={16} aria-hidden="true" />
            <p>RECENTLY LISTED</p><strong>{recentlyListed.length}</strong><span>issues with verified listing dates</span>
            <div>{recentlyListed.slice(0, 2).map((ipo) => <Link key={ipo.id} href={`/ipo/${ipo.slug}`}>{ipo.company.name}{ipo.listingDate ? ` · ${date(ipo.listingDate)}` : ""}<ArrowUpRight size={11} /></Link>)}</div>
          </article>
          <article>
            <FileText size={16} aria-hidden="true" />
            <p>UPCOMING</p><strong>{upcoming.length}</strong><span>issues currently on the calendar</span>
            <div>{upcoming.slice(0, 2).map((ipo) => <Link key={ipo.id} href={`/ipo/${ipo.slug}`}>{ipo.company.name}<ArrowUpRight size={11} /></Link>)}</div>
          </article>
          <article>
            <FileText size={16} aria-hidden="true" />
            <p>NEW FILINGS</p><strong>{newFilings.length}</strong><span>recent DRHP and RHP records</span>
            <div>{newFilings.slice(0, 2).map((ipo) => ipo.latestDocumentUrl && ipo.latestDocumentAvailability !== "not_found" ? <a key={ipo.id} href={ipo.latestDocumentUrl} target="_blank" rel="noreferrer">{ipo.company.name} · {ipo.latestFilingDate ? date(ipo.latestFilingDate) : formatBoard(ipo.type)}<ArrowUpRight size={11} /></a> : <Link key={ipo.id} href={`/ipo/${ipo.slug}`}>{ipo.company.name}<ArrowUpRight size={11} /></Link>)}</div>
          </article>
        </div>
      </section>

      <section className={`site-container ${styles.lowerGrid}`}>
        <div>
          <div className={styles.sectionHead}><div><p className="section-kicker">UPCOMING EVENTS</p><h2>IPO calendar</h2></div><Link href="/calendar">Full calendar <ArrowUpRight size={12} /></Link></div>
          <div className={styles.timelinePreview}>
            {calendar.map((event, index) => (
              <Link href={`/ipo/${ipos.find((ipo) => ipo.id === event.ipoId)?.slug}`} key={event.id}>
                <time><b>{date(event.date).split(" ")[0]}</b><span>{date(event.date).split(" ")[1]} · {day(event.date)}</span></time>
                <i className={styles[event.type]} />
                <span><small>{event.label}</small><strong>{ipoName(event.ipoId)}</strong></span>
                {index === 0 && <em>NEXT</em>}
              </Link>
            ))}
            {!calendar.length ? <p className={styles.feedEmpty}>{unavailable.events ? "Calendar data temporarily unavailable." : "No upcoming verified events."}</p> : null}
          </div>
        </div>

        <div>
          <div className={styles.sectionHead}><div><p className="section-kicker">MARKET DESK</p><h2>Latest IPO news</h2></div><Link href="/news">All news <ArrowUpRight size={12} /></Link></div>
          <div className={styles.newsList}>
            {news.slice(0, 5).map((item) => (
              <article key={item.id}>
                <p><span>{item.category}</span><time>{date(item.publishedAt)}</time></p>
                {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.headline}</a> : <Link href={item.ipoId ? `/ipo/${ipos.find((ipo) => ipo.id === item.ipoId)?.slug}#news` : "/news"}>{item.headline}</Link>}
                <small>{item.source.sourceName}</small>
              </article>
            ))}
            {!news.length ? <p className={styles.feedEmpty}>{unavailable.news ? "News data temporarily unavailable." : "No publisher items are available."}</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
