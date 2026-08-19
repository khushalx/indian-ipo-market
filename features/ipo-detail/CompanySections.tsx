import {
  ArrowUpRight,
  Building2,
  Check,
  Circle,
  FileText,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import type {
  IPO,
  IPODocument,
  IPOEvent,
  NewsArticle,
} from "@/types";
import { EmptyState, SectionHeading, SourceLine } from "./DetailPrimitives";
import {
  formatCrore,
  formatDate,
  formatDateTime,
  formatPercent,
  titleCase,
} from "./format";
import styles from "./ipo-detail.module.css";

export function OverviewSection({ ipo }: { ipo: IPO }) {
  return (
    <section id="overview" className={`${styles.section} ${styles.overviewSection}`}>
      <SectionHeading
        eyebrow="Issue at a glance"
        title="Overview"
        description="The essential offer structure and issuer context, traceable to the underlying source."
        aside={<SourceLine source={ipo.source} compact />}
      />
      <div className={styles.overviewGrid}>
        <div className={styles.editorialIntro}>
          <p>{ipo.company.overview ?? "Business information has not yet been verified from an offer document."}</p>
          <SourceLine source={ipo.company.source} />
        </div>
        <dl className={styles.factList}>
          <div><dt>Fresh issue</dt><dd>{formatCrore(ipo.freshIssueCr)}</dd></div>
          <div><dt>Offer for Sale</dt><dd>{formatCrore(ipo.offerForSaleCr)}</dd></div>
          <div><dt>Exchange</dt><dd>{ipo.exchange.length ? ipo.exchange.map((item) => item.replace("_", " ")).join(", ") : "Not announced"}</dd></div>
          <div><dt>Registrar</dt><dd>{ipo.registrar ? <a href={ipo.registrar.website} target="_blank" rel="noreferrer">{ipo.registrar.name}<ArrowUpRight aria-hidden="true" size={11} /></a> : "Not announced"}</dd></div>
          <div><dt>Lead managers</dt><dd>{ipo.leadManagers.join(", ") || "—"}</dd></div>
          <div><dt>Promoter holding</dt><dd>{formatPercent(ipo.preIssuePromoterHolding)} → {formatPercent(ipo.postIssuePromoterHolding)}</dd></div>
        </dl>
      </div>
      {ipo.mockDisclaimer ? <div className={styles.developmentNotice}>
        <span aria-hidden="true" />
        <div><strong>Development dataset</strong><p>Figures on this Phase 1 page are realistic mock data for product testing and are not live market information.</p></div>
      </div> : null}
    </section>
  );
}

export function CompanySection({ ipo }: { ipo: IPO }) {
  const { company } = ipo;
  return (
    <section id="company" className={styles.section}>
      <SectionHeading
        eyebrow="Issuer profile"
        title="Company"
        description="What the issuer does, who runs it and the principal offer-document factors to consider."
      />
      <div className={styles.companyProfile}>
        <article>
          <Building2 aria-hidden="true" size={18} />
          <h3>Business overview</h3>
          <p>{company.overview ?? "A verified business overview has not yet been added."}</p>
        </article>
        <dl className={styles.companyFacts}>
          <div><dt>Founded</dt><dd>{company.foundedYear || "—"}</dd></div>
          <div><dt>Headquarters</dt><dd>{company.headquarters || "—"}</dd></div>
          <div><dt>Industry</dt><dd>{company.industry || "—"}</dd></div>
          <div><dt>Sector</dt><dd>{company.sector || "—"}</dd></div>
          <div><dt>MD / CEO</dt><dd>{company.managingDirector || "—"}</dd></div>
          <div><dt>Promoters</dt><dd>{company.promoters.join(", ") || "—"}</dd></div>
          <div className={styles.wideFact}><dt>Key products & services</dt><dd>{company.keyProducts.join(" · ") || "—"}</dd></div>
        </dl>
      </div>

      <div className={styles.considerations}>
        <article className={styles.strengths}>
          <h3><Check aria-hidden="true" size={16} />Business strengths</h3>
          {company.strengths.length ? (
            <ul>{company.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : (
            <p>Not available in the current source.</p>
          )}
        </article>
        <article className={styles.risks}>
          <h3><ShieldAlert aria-hidden="true" size={16} />Key risks</h3>
          {company.risks.length ? (
            <ul>{company.risks.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : (
            <p>Not available in the current source.</p>
          )}
        </article>
      </div>
      <p className={styles.dataNote}>
        Strengths and risks are condensed factual disclosures for research convenience, not an investment recommendation. Read the offer document before making a decision.
      </p>
      <SourceLine source={company.source} />
    </section>
  );
}

export function ObjectsSection({ ipo }: { ipo: IPO }) {
  const freshIssue = ipo.freshIssueCr ?? 0;
  const offerForSale = ipo.offerForSaleCr ?? 0;
  const hasIssueSplit = ipo.freshIssueCr != null || ipo.offerForSaleCr != null;
  const total = freshIssue + offerForSale;
  const freshPercent = total > 0 ? (freshIssue / total) * 100 : 0;
  const ofsPercent = total > 0 ? (offerForSale / total) * 100 : 0;

  return (
    <section id="objects" className={styles.section}>
      <SectionHeading
        eyebrow="Capital allocation"
        title="Objects of the issue"
        description="How much capital enters the company, how much goes to selling shareholders, and the stated use of fresh proceeds."
      />

      {hasIssueSplit ? <div className={styles.issueSplit}>
        <div className={styles.splitLabels}>
          <div><span>Fresh issue</span><strong>{formatCrore(ipo.freshIssueCr)}</strong><small>{formatPercent(freshPercent)} of offer</small></div>
          <div className={styles.ofsLabel}><span>Offer for Sale</span><strong>{formatCrore(ipo.offerForSaleCr)}</strong><small>{formatPercent(ofsPercent)} of offer</small></div>
        </div>
        <div className={styles.splitBar} aria-label={`Fresh issue ${formatPercent(freshPercent)}, Offer for Sale ${formatPercent(ofsPercent)}`}>
          <span className={styles.freshBar} style={{ width: `${freshPercent}%` }} />
          <span className={styles.ofsBar} style={{ width: `${ofsPercent}%` }} />
        </div>
      </div> : <EmptyState title="Offer structure is not announced">Fresh issue and offer-for-sale details will appear after a verified offer document supplies them.</EmptyState>}

      {offerForSale > 0 ? (
        <div className={styles.ofsNotice}>
          <strong>OFS does not fund the company.</strong>
          <p>{formatCrore(ipo.offerForSaleCr)} is consideration to selling shareholders; only the fresh issue is available to the issuer for stated objects.</p>
        </div>
      ) : null}

      <div className={styles.proceedsBlock}>
        <h3>Use of fresh proceeds</h3>
        {ipo.useOfProceeds?.length ? (
          <ol className={styles.proceedsList}>
            {ipo.useOfProceeds.map((item) => (
              <li key={item.label}>
                <div><span>{item.label}</span><strong>{formatCrore(item.amountCr)}</strong></div>
                <div className={styles.proceedsTrack} aria-hidden="true"><i style={{ width: `${Math.min(item.percentage ?? 0, 100)}%` }} /></div>
                <small>{formatPercent(item.percentage)} of fresh issue</small>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="Use-of-proceeds breakdown is unavailable">
            The provider has not added a verified allocation from the offer document.
          </EmptyState>
        )}
      </div>
      <SourceLine source={ipo.source} />
    </section>
  );
}

const eventOrder: IPOEvent["type"][] = [
  "drhp_filed",
  "sebi_observation",
  "rhp_filed",
  "anchor_allocation",
  "ipo_open",
  "ipo_close",
  "basis_of_allotment",
  "demat_credit",
  "listing",
];

export function TimelineSection({ events }: { events: IPOEvent[] }) {
  const timeline = [...events].sort(
    (a, b) => eventOrder.indexOf(a.type) - eventOrder.indexOf(b.type),
  );
  const source = timeline.find((event) => event.source)?.source;

  return (
    <section id="timeline" className={styles.section}>
      <SectionHeading
        eyebrow="Issue lifecycle"
        title="IPO timeline"
        description="Regulatory milestones through allotment and exchange listing."
        aside={<SourceLine source={source} compact />}
      />
      {!timeline.length ? (
        <EmptyState title="Timeline data is not available">
          Verified milestone dates have not been supplied for this issue.
        </EmptyState>
      ) : (
        <ol className={styles.timeline}>
          {timeline.map((event) => (
            <li className={styles[`event_${event.state}`]} key={event.id}>
              <div className={styles.eventMarker} aria-hidden="true">
                {event.state === "completed" ? <Check size={12} /> : <Circle size={10} />}
              </div>
              <div className={styles.eventCopy}>
                <span>{event.state === "current" ? "Current stage" : titleCase(event.state)}</span>
                <strong>{event.label}</strong>
                <time dateTime={event.date}>{formatDate(event.date)}</time>
                {event.note ? <small>{event.note}</small> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function DocumentsSection({ documents }: { documents: IPODocument[] }) {
  const source = documents[0]?.source;
  return (
    <section id="documents" className={styles.section}>
      <SectionHeading
        eyebrow="Primary sources"
        title="Documents"
        description="Offer and exchange filings used to verify the issue. Open links at the originating source."
        aside={<SourceLine source={source} compact />}
      />
      {!documents.length ? (
        <EmptyState title="No documents are available">
          Filing links have not yet been added by the documents provider.
        </EmptyState>
      ) : (
        <ul className={styles.documentList}>
          {documents.map((document) => (
            <li key={document.id}>
              <FileText aria-hidden="true" size={18} />
              <div><span>{titleCase(document.type)}</span><strong>{document.title}</strong><small>{formatDate(document.publishedAt)} · {document.source.sourceName}</small></div>
              {document.availability === "not_found" ? (
                <span className={styles.documentAvailability}>
                  Link unavailable at {document.source.sourceName}
                  {document.checkedAt ? ` · checked ${formatDateTime(document.checkedAt)}` : ""}
                </span>
              ) : (
                <a
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${document.availability === "unknown" ? "Try official link for" : "Open"} ${document.title}`}
                >
                  {document.availability === "unknown" ? "Try official link" : "Open"}
                  <ArrowUpRight aria-hidden="true" size={13} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NewsSection({ news }: { news: NewsArticle[] }) {
  return (
    <section id="news" className={styles.section}>
      <SectionHeading
        eyebrow="Company coverage"
        title="Latest news"
        description="Relevant reporting and market updates connected to this issue."
      />
      {!news.length ? (
        <EmptyState title="No company news yet">
          Relevant coverage will appear here when it is available from the news provider.
        </EmptyState>
      ) : (
        <ol className={styles.newsList}>
          {news.map((article) => (
            <li key={article.id}>
              <div className={styles.newsMeta}>
                <span>{article.source.sourceName}</span>
                <span>{titleCase(article.category)}</span>
                <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
              </div>
              <Link href={article.url ?? "/news"} target={article.url ? "_blank" : undefined} rel={article.url ? "noreferrer" : undefined}>
                <h3>{article.headline}</h3>
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
              <p>{article.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
