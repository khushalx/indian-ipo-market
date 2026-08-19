import { ArrowUpRight, CalendarClock, FileText, Landmark, ListChecks } from "lucide-react";
import Link from "next/link";
import { formatDate, formatMarketValue } from "@/lib/format";
import type { IPO, IPOEvent, MarketIndex, NewsArticle } from "@/types";
import { IPOMarketTable } from "./ipo-market-table";
import styles from "./home-page.module.css";

type Props = { ipos: IPO[]; indices: MarketIndex[]; events: IPOEvent[]; news: NewsArticle[] };
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });

function date(value: string) { return formatDate(value.slice(0, 10), "short"); }
function day(value: string) { return dayFmt.format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`)); }

export function HomePage({ ipos, indices, events, news }: Props) {
  const open = ipos.filter((ipo) => ipo.status === "open");
  const upcoming = ipos.filter((ipo) => ipo.status === "upcoming");
  const closing = [...open].sort((a, b) => (a.closeDate ?? "").localeCompare(b.closeDate ?? ""))[0];
  const listings = events.filter((event) => event.type === "listing" && event.state !== "completed").slice(0, 3);
  const calendar = events.filter((event) => event.state !== "completed").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  const ipoName = (id: string) => ipos.find((ipo) => ipo.id === id)?.company.name ?? "IPO";

  return (
    <main>
      <section className={styles.marketStrip} aria-label="Development market snapshot">
        <div className={`site-container ${styles.marketInner}`}>
          <span className={styles.marketLabel}>MARKETS</span>
          {indices.map((index) => (
            <div className={styles.index} key={index.id}>
              <span>{index.name}</span><strong>{formatMarketValue(index.value)}</strong><em className={index.changePercent >= 0 ? "financial-up" : "financial-down"}>{index.changePercent >= 0 ? "+" : ""}{index.changePercent.toFixed(2)}%</em>
            </div>
          ))}
          <span className={styles.marketTime}>Source: {Array.from(new Set(indices.map((index) => index.source.sourceName))).join(" · ")} · Updated 19 Aug · Sample</span>
        </div>
      </section>

      <section className={`site-container ${styles.intro}`}>
        <div>
          <p className="section-kicker">PRIMARY MARKET INTELLIGENCE</p>
          <h1>IPO Market</h1>
          <p>India&apos;s public issues, from filing to listing—organised for decisions, not noise.</p>
        </div>
        <div className="mock-badge"><span /> Development data · Not live</div>
      </section>

      <section className={`site-container ${styles.marketSection}`} aria-labelledby="market-table-title">
        <div className="sr-only"><h2 id="market-table-title">IPO market table</h2></div>
        <IPOMarketTable ipos={ipos} />
      </section>

      <section className={`site-container ${styles.activity}`} aria-labelledby="activity-title">
        <div className={styles.sectionHead}><div><p className="section-kicker">AT A GLANCE</p><h2 id="activity-title">IPO activity</h2></div><span>As of 19 Aug 2026 · Sample</span></div>
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
            <p>LISTINGS AHEAD</p><strong>{listings.length}</strong><span>expected in the next cycle</span>
            <div>{listings.slice(0, 2).map((event) => <Link key={event.id} href={`/ipo/${ipos.find((ipo) => ipo.id === event.ipoId)?.slug}`}>{ipoName(event.ipoId)} · {date(event.date)}<ArrowUpRight size={11} /></Link>)}</div>
          </article>
          <article>
            <FileText size={16} aria-hidden="true" />
            <p>UPCOMING</p><strong>{upcoming.length}</strong><span>issues currently on the calendar</span>
            <div>{upcoming.slice(0, 2).map((ipo) => <Link key={ipo.id} href={`/ipo/${ipo.slug}`}>{ipo.company.name}<ArrowUpRight size={11} /></Link>)}</div>
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
          </div>
        </div>

        <div>
          <div className={styles.sectionHead}><div><p className="section-kicker">MARKET DESK</p><h2>Latest IPO news</h2></div><Link href="/news">All news <ArrowUpRight size={12} /></Link></div>
          <div className={styles.newsList}>
            {news.slice(0, 5).map((item) => (
              <article key={item.id}>
                <p><span>{item.category}</span><time>{date(item.publishedAt)}</time></p>
                <Link href={item.ipoId ? `/ipo/${ipos.find((ipo) => ipo.id === item.ipoId)?.slug}#news` : "/news"}>{item.headline}</Link>
                <small>{item.source.sourceName}</small>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
