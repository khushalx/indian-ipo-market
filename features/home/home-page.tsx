import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Coins,
  FileText,
  Landmark,
  ListChecks,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { formatBoard, formatCrore, formatDate, formatDateTime, formatMarketValue } from "@/lib/format";
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

  const totalCapitalCr = ipos.reduce((sum, ipo) => sum + (ipo.issueSizeCr ?? 0), 0);
  const topGmpIpo = [...ipos]
    .filter((ipo) => ipo.gmp && ipo.priceBandMax && ipo.status !== "listed")
    .sort((a, b) => ((b.gmp! / b.priceBandMax!) - (a.gmp! / a.priceBandMax!)))[0];

  return (
    <main className={styles.main}>
      {/* Real-time Market Indices Strip */}
      <section className={styles.marketStrip} aria-label="Market snapshot">
        <div className={`site-container ${styles.marketInner}`}>
          <div className={styles.marketLiveBadge}>
            <span className={styles.liveDot} />
            <span className={styles.marketLabel}>MARKETS</span>
          </div>

          <div className={styles.indicesScroll}>
            {indices.length ? indices.map((index) => (
              <div className={styles.index} key={index.id}>
                <span className={styles.indexName}>{index.name}</span>
                <strong className={styles.indexValue}>{formatMarketValue(index.value)}</strong>
                <span className={`${styles.indexChange} ${index.changePercent >= 0 ? "financial-up" : "financial-down"}`}>
                  {index.changePercent >= 0 ? "+" : ""}{index.changePercent.toFixed(2)}%
                </span>
              </div>
            )) : (
              <span className={styles.marketTime}>
                {unavailable.market ? "Market data temporarily unavailable" : "Market feed unavailable"}
              </span>
            )}
          </div>

          {indices.length ? (
            <span className={styles.marketTime}>
              Source: {Array.from(new Set(indices.map((index) => index.source.sourceName))).join(" · ")} · {Array.from(new Set(indices.map((index) => index.timeliness ?? "UNKNOWN"))).join(" · ")} · {formatDateTime(indices[0]?.asOf)}
            </span>
          ) : null}
        </div>
      </section>

      {/* Hero Section */}
      <section className={`site-container ${styles.heroSection}`}>
        <div className={styles.heroContent}>
          <div className={styles.intro}>
            <div>
              <p className="section-kicker">
                <Sparkles size={13} aria-hidden="true" />
                PRIMARY MARKET INTELLIGENCE
              </p>
              <h1>IPO Market</h1>
              <p>India&apos;s public issues, from filing to listing—organised for decisions, not noise.</p>
            </div>
            {unavailable.ipos ? (
              <div className="mock-badge"><span /> Data temporarily unavailable</div>
            ) : isMock ? (
              <div className="mock-badge"><span /> Development data · Not live</div>
            ) : (
              <div className="mock-badge"><span /> Source-aware data · {dataAsOf ? formatDate(dataAsOf, "medium") : "Availability varies"}</div>
            )}
          </div>

          {/* High-Impact Stat Cards */}
          <div className={styles.heroStatsGrid}>
            <div className={styles.heroStatCard}>
              <div className={styles.statIconWrap}>
                <Landmark size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Open for Bidding</span>
                <strong className={styles.statNum}>{open.length}</strong>
                <span className={styles.statSub}>
                  {open.length ? `${open[0]?.company.name}${open.length > 1 ? ` +${open.length - 1} more` : ""}` : "No live issues"}
                </span>
              </div>
            </div>

            <div className={styles.heroStatCard}>
              <div className={styles.statIconWrap}>
                <TrendingUp size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Top GMP Gainer</span>
                <strong className={styles.statNum}>
                  {topGmpIpo && topGmpIpo.priceBandMax && topGmpIpo.gmp ? `+${((topGmpIpo.gmp / topGmpIpo.priceBandMax) * 100).toFixed(0)}%` : "—"}
                </strong>
                <span className={styles.statSub}>
                  {topGmpIpo ? (
                    <Link href={`/ipo/${topGmpIpo.slug}`} className={styles.inlineLink}>
                      {topGmpIpo.company.name} <ArrowUpRight size={11} />
                    </Link>
                  ) : "No active quotes"}
                </span>
              </div>
            </div>

            <div className={styles.heroStatCard}>
              <div className={styles.statIconWrap}>
                <CalendarClock size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Closing Next</span>
                <strong className={styles.statNum}>{closing ? date(closing.closeDate!) : "—"}</strong>
                <span className={styles.statSub}>{closing?.company.name ?? "No active close"}</span>
              </div>
            </div>

            <div className={styles.heroStatCard}>
              <div className={styles.statIconWrap}>
                <Coins size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Tracked Pipeline</span>
                <strong className={styles.statNum}>{formatCrore(totalCapitalCr, 0)}</strong>
                <span className={styles.statSub}>{ipos.length} total issues tracked</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Market Table & Grid */}
      <section className={`site-container ${styles.marketSection}`} aria-labelledby="market-table-title">
        <div className="sr-only"><h2 id="market-table-title">IPO market table</h2></div>
        <IPOMarketTable ipos={ipos} />
      </section>

      {/* Primary Market Activity Pulse */}
      <section className={`site-container ${styles.activity}`} aria-labelledby="activity-title">
        <div className={styles.sectionHead}>
          <div>
            <p className="section-kicker"><Activity size={13} aria-hidden="true" /> AT A GLANCE</p>
            <h2 id="activity-title">IPO activity</h2>
          </div>
          <span className={styles.updatedTime}>
            {unavailable.ipos ? "Data temporarily unavailable" : dataAsOf ? `Updated ${formatDateTime(dataAsOf)}` : "No verified records yet"}
          </span>
        </div>

        <div className={styles.activityGrid}>
          <article className={styles.activityCard}>
            <div className={styles.cardTopRow}>
              <span className={styles.cardKicker}>OPEN NOW</span>
              <div className={styles.cardIconBadge}><Landmark size={15} aria-hidden="true" /></div>
            </div>
            <strong>{open.length}</strong>
            <span>public issues accepting bids</span>
            <div className={styles.cardLinks}>
              {open.slice(0, 2).map((ipo) => (
                <Link key={ipo.id} href={`/ipo/${ipo.slug}`} className={styles.activityLink}>
                  <span>{ipo.company.name}</span>
                  <ArrowUpRight size={13} />
                </Link>
              ))}
            </div>
          </article>

          <article className={styles.activityCard}>
            <div className={styles.cardTopRow}>
              <span className={styles.cardKicker}>CLOSING SOON</span>
              <div className={styles.cardIconBadge}><CalendarClock size={15} aria-hidden="true" /></div>
            </div>
            <strong>{closing ? date(closing.closeDate!) : "—"}</strong>
            <span>{closing?.company.name ?? "No active close"}</span>
            <div className={styles.cardLinks}>
              {closing && (
                <Link href={`/ipo/${closing.slug}`} className={styles.activityLink}>
                  <span>View bidding details</span>
                  <ArrowUpRight size={13} />
                </Link>
              )}
            </div>
          </article>

          <article className={styles.activityCard}>
            <div className={styles.cardTopRow}>
              <span className={styles.cardKicker}>RECENTLY LISTED</span>
              <div className={styles.cardIconBadge}><ListChecks size={15} aria-hidden="true" /></div>
            </div>
            <strong>{recentlyListed.length}</strong>
            <span>issues with verified listing dates</span>
            <div className={styles.cardLinks}>
              {recentlyListed.slice(0, 2).map((ipo) => (
                <Link key={ipo.id} href={`/ipo/${ipo.slug}`} className={styles.activityLink}>
                  <span>{ipo.company.name}{ipo.listingDate ? ` · ${date(ipo.listingDate)}` : ""}</span>
                  <ArrowUpRight size={13} />
                </Link>
              ))}
            </div>
          </article>

          <article className={styles.activityCard}>
            <div className={styles.cardTopRow}>
              <span className={styles.cardKicker}>UPCOMING</span>
              <div className={styles.cardIconBadge}><FileText size={15} aria-hidden="true" /></div>
            </div>
            <strong>{upcoming.length}</strong>
            <span>issues currently on the calendar</span>
            <div className={styles.cardLinks}>
              {upcoming.slice(0, 2).map((ipo) => (
                <Link key={ipo.id} href={`/ipo/${ipo.slug}`} className={styles.activityLink}>
                  <span>{ipo.company.name}</span>
                  <ArrowUpRight size={13} />
                </Link>
              ))}
            </div>
          </article>

          <article className={styles.activityCard}>
            <div className={styles.cardTopRow}>
              <span className={styles.cardKicker}>NEW FILINGS</span>
              <div className={styles.cardIconBadge}><FileText size={15} aria-hidden="true" /></div>
            </div>
            <strong>{newFilings.length}</strong>
            <span>recent DRHP and RHP records</span>
            <div className={styles.cardLinks}>
              {newFilings.slice(0, 2).map((ipo) =>
                ipo.latestDocumentUrl && ipo.latestDocumentAvailability !== "not_found" ? (
                  <a key={ipo.id} href={ipo.latestDocumentUrl} target="_blank" rel="noreferrer" className={styles.activityLink}>
                    <span>{ipo.company.name} · {ipo.latestFilingDate ? date(ipo.latestFilingDate) : formatBoard(ipo.type)}</span>
                    <ArrowUpRight size={13} />
                  </a>
                ) : (
                  <Link key={ipo.id} href={`/ipo/${ipo.slug}`} className={styles.activityLink}>
                    <span>{ipo.company.name}</span>
                    <ArrowUpRight size={13} />
                  </Link>
                )
              )}
            </div>
          </article>
        </div>
      </section>

      {/* Calendar Timeline & Market News Grid */}
      <section className={`site-container ${styles.lowerGrid}`}>
        <div className={styles.lowerCard}>
          <div className={styles.sectionHead}>
            <div>
              <p className="section-kicker">UPCOMING EVENTS</p>
              <h2>IPO calendar</h2>
            </div>
            <Link href="/calendar" className={styles.sectionAction}>
              Full calendar <ChevronRight size={14} />
            </Link>
          </div>
          <div className={styles.timelinePreview}>
            {calendar.map((event, index) => (
              <Link href={`/ipo/${ipos.find((ipo) => ipo.id === event.ipoId)?.slug}`} key={event.id} className={styles.timelineItem}>
                <div className={styles.timelineDateBadge}>
                  <b>{date(event.date).split(" ")[0]}</b>
                  <span>{date(event.date).split(" ")[1]} · {day(event.date)}</span>
                </div>
                <i className={`${styles.eventDot} ${styles[event.type]}`} />
                <div className={styles.eventInfo}>
                  <small>{event.label}</small>
                  <strong>{ipoName(event.ipoId)}</strong>
                </div>
                {index === 0 && <span className={styles.nextBadge}>NEXT</span>}
              </Link>
            ))}
            {!calendar.length ? (
              <p className={styles.feedEmpty}>
                {unavailable.events ? "Calendar data temporarily unavailable." : "No upcoming verified events."}
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles.lowerCard}>
          <div className={styles.sectionHead}>
            <div>
              <p className="section-kicker">MARKET DESK</p>
              <h2>Latest IPO news</h2>
            </div>
            <Link href="/news" className={styles.sectionAction}>
              All news <ChevronRight size={14} />
            </Link>
          </div>
          <div className={styles.newsList}>
            {news.slice(0, 5).map((item) => (
              <article key={item.id} className={styles.newsItem}>
                <div className={styles.newsMeta}>
                  <span className={styles.newsCat}>{item.category}</span>
                  <time>{date(item.publishedAt)}</time>
                </div>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className={styles.newsHeadline}>
                    {item.headline}
                  </a>
                ) : (
                  <Link href={item.ipoId ? `/ipo/${ipos.find((ipo) => ipo.id === item.ipoId)?.slug}#news` : "/news"} className={styles.newsHeadline}>
                    {item.headline}
                  </Link>
                )}
                <small className={styles.newsSource}>{item.source.sourceName}</small>
              </article>
            ))}
            {!news.length ? (
              <p className={styles.feedEmpty}>
                {unavailable.news ? "News data temporarily unavailable." : "No publisher items are available."}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

