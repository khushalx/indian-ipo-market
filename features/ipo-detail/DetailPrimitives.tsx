import { ArrowUpRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { Source } from "@/types";
import { relativeUpdatedAt } from "@/lib/ingestion/freshness";
import { formatDateTime } from "./format";
import styles from "./ipo-detail.module.css";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  aside?: ReactNode;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  aside,
}: SectionHeadingProps) {
  return (
    <header className={styles.sectionHeading}>
      <div>
        {eyebrow ? <p className={styles.sectionEyebrow}>{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {aside ? <div className={styles.sectionAside}>{aside}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.emptyState} role="status">
      <Info aria-hidden="true" size={16} />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function SourceLine({
  source,
  updatedAt,
  compact = false,
}: {
  source?: Source;
  updatedAt?: string;
  compact?: boolean;
}) {
  if (!source && !updatedAt) return null;

  return (
    <p className={compact ? styles.sourceCompact : styles.sourceLine}>
      Source:{" "}
      {source?.sourceUrl ? (
        <a href={source.sourceUrl} target="_blank" rel="noreferrer">
          {source.sourceName}
          <ArrowUpRight aria-hidden="true" size={11} />
        </a>
      ) : (
        <span>{source?.sourceName ?? "Provider"}</span>
      )}
      {source ? <span>{" "}· {source.isOfficial ? "Official" : "Unofficial"}</span> : null}
      {(updatedAt ?? source?.lastUpdated) ? (
        <span>
          {" "}·{" "}
          {compact
            ? relativeUpdatedAt(updatedAt ?? source?.lastUpdated)
            : formatDateTime(updatedAt ?? source?.lastUpdated)}
        </span>
      ) : null}
    </p>
  );
}

export function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`${styles.metric} ${accent ? styles.metricAccent : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
