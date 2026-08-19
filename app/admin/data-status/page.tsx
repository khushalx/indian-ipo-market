import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isAdminEmail } from "@/lib/env";
import { readAdminDashboard, type AdminDashboard } from "@/lib/admin/repository";
import { AdminControls } from "./AdminControls";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data status",
  description: "Protected ingestion and provenance controls.",
  robots: { index: false, follow: false, nocache: true },
};

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function formatInstant(value: number | null | undefined) {
  if (value === null || value === undefined) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : formatter.format(date);
}

function statusClass(status: string | null) {
  const normalized = status?.toUpperCase();
  if (normalized === "HEALTHY" || normalized === "SUCCEEDED") return styles.positive;
  if (normalized === "DEGRADED" || normalized === "PARTIAL" || normalized === "RUNNING") return styles.warning;
  if (normalized === "OFFLINE" || normalized === "FAILED") return styles.negative;
  return styles.neutral;
}

async function dashboardOrNull(): Promise<AdminDashboard | null> {
  try {
    return await readAdminDashboard();
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin_dashboard_unavailable",
      error: error instanceof Error ? error.message : "unknown_error",
    }));
    return null;
  }
}

export default async function DataStatusPage() {
  const user = await requireChatGPTUser("/admin/data-status");
  if (!isAdminEmail(user.email)) notFound();

  const dashboard = await dashboardOrNull();
  const failedProviders = dashboard?.providers.filter((provider) => provider.health === "OFFLINE" || provider.health === "DEGRADED").length ?? 0;
  const successfulRuns = dashboard?.runs.filter((run) => run.status === "SUCCEEDED").length ?? 0;

  return (
    <main className={`site-container ${styles.page}`}>
      <header className={styles.hero}>
        <div>
          <p className="section-kicker">INTERNAL · RESTRICTED</p>
          <h1>Data operations</h1>
          <p>Provider health, ingestion runs, selected provenance, and verified administrative changes.</p>
        </div>
        <div className={styles.identity}>
          <span>Authenticated operator</span>
          <strong>{user.email}</strong>
          <small>Not indexed · no shared access</small>
        </div>
      </header>

      {!dashboard ? (
        <section className={styles.unavailable} role="status">
          <p className="section-kicker">DATA STORE UNAVAILABLE</p>
          <h2>The operational database could not be read.</h2>
          <p>No provider details or controls are exposed while the D1 binding or schema is unavailable.</p>
        </section>
      ) : (
        <>
          <section className={styles.metrics} aria-label="Operational summary">
            <article><span>Configured sources</span><strong>{dashboard.providers.length}</strong><small>{dashboard.providers.filter((provider) => provider.isActive).length} active</small></article>
            <article><span>Degraded / offline</span><strong>{failedProviders}</strong><small>Current provider state</small></article>
            <article><span>Recent successful runs</span><strong>{successfulRuns}</strong><small>Last {dashboard.runs.length} runs</small></article>
            <article><span>Tracked IPO records</span><strong>{dashboard.ipos.length}</strong><small>Most recently observed 50</small></article>
          </section>

          <section className={styles.section} aria-labelledby="provider-health-title">
            <div className={styles.sectionHeading}>
              <div><p className="section-kicker">PROVIDERS</p><h2 id="provider-health-title">Health and freshness</h2></div>
              <p>An unknown state means no completed provider attempt has been stored; it is not interpreted as healthy.</p>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Source</th><th>Health</th><th>Last success</th><th>Records</th><th>Latency</th><th>Latest failure</th></tr></thead>
                <tbody>
                  {dashboard.providers.length ? dashboard.providers.map((provider) => (
                    <tr key={provider.providerKey}>
                      <td><strong>{provider.providerName}</strong><small>{provider.sourceKind} · {provider.isOfficial ? "Official" : "External"}{provider.isActive ? "" : " · Inactive"}</small></td>
                      <td><span className={`${styles.pill} ${statusClass(provider.health)}`}>{provider.health ?? "UNKNOWN"}</span></td>
                      <td>{formatInstant(provider.lastSuccessfulAt)}</td>
                      <td className="tabular">{provider.recordsSynced ?? 0}</td>
                      <td className="tabular">{provider.latencyMs == null ? "—" : `${provider.latencyMs} ms`}</td>
                      <td>{provider.lastErrorMessage ? <><strong>{provider.lastErrorCode ?? "ERROR"}</strong><small>{provider.lastErrorMessage}</small></> : "—"}</td>
                    </tr>
                  )) : <tr><td colSpan={6} className={styles.emptyCell}>No provider sources have been registered.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="runs-title">
            <div className={styles.sectionHeading}>
              <div><p className="section-kicker">INGESTION</p><h2 id="runs-title">Recent runs</h2></div>
              <p>Counts reflect persisted provider results. Partial runs remain visible instead of being promoted to successful.</p>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Job</th><th>Status</th><th>Started</th><th>Fetched</th><th>Created / updated</th><th>Errors</th></tr></thead>
                <tbody>
                  {dashboard.runs.length ? dashboard.runs.map((run) => (
                    <tr key={run.id}>
                      <td><strong>{run.jobType}</strong><small>{run.providerKey} · {run.trigger}</small></td>
                      <td><span className={`${styles.pill} ${statusClass(run.status)}`}>{run.status}</span></td>
                      <td>{formatInstant(run.startedAt)}<small>{run.finishedAt ? `Finished ${formatInstant(run.finishedAt)}` : "Still open"}</small></td>
                      <td className="tabular">{run.recordsFetched}</td>
                      <td className="tabular">{run.recordsCreated} / {run.recordsUpdated}<small>{run.recordsSkipped} skipped</small></td>
                      <td className="tabular">{run.errorCount}{run.errorSummary ? <small>{run.errorSummary}</small> : null}</td>
                    </tr>
                  )) : <tr><td colSpan={6} className={styles.emptyCell}>No ingestion runs have been stored.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="ipo-records-title">
            <div className={styles.sectionHeading}>
              <div><p className="section-kicker">RECORDS</p><h2 id="ipo-records-title">Recent IPOs and sources</h2></div>
              <p>Offer fields may remain unannounced. The table shows only values and provenance currently persisted.</p>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Company</th><th>Lifecycle</th><th>Price band</th><th>Offer dates</th><th>Latest filing source</th><th>Selected fields</th></tr></thead>
                <tbody>
                  {dashboard.ipos.length ? dashboard.ipos.map((ipo) => (
                    <tr key={ipo.id}>
                      <td><Link className={styles.recordLink} href={`/ipo/${ipo.slug}`}>{ipo.companyName}</Link><small>{ipo.id}</small></td>
                      <td><span className={`${styles.pill} ${styles.neutral}`}>{ipo.status}</span><small>{ipo.board ?? "Board unannounced"}</small></td>
                      <td className="tabular">{ipo.priceBandMin && ipo.priceBandMax ? `₹${ipo.priceBandMin}–₹${ipo.priceBandMax}` : "Not announced"}</td>
                      <td>{ipo.openDate && ipo.closeDate ? `${ipo.openDate} → ${ipo.closeDate}` : "Not announced"}<small>{ipo.listingDate ? `Listing ${ipo.listingDate}` : "Listing date unavailable"}</small></td>
                      <td>{ipo.latestSource ?? "No filing source"}<small>{ipo.latestDocumentType && ipo.latestFilingDate ? `${ipo.latestDocumentType} · ${ipo.latestFilingDate}` : "No current filing stored"}</small></td>
                      <td className="tabular">{ipo.selectedFieldCount}<small>Last seen {formatInstant(ipo.lastSeenAt)}</small></td>
                    </tr>
                  )) : <tr><td colSpan={6} className={styles.emptyCell}>No IPO records have been persisted.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.twoColumn}>
            <div className={styles.section}>
              <div className={styles.sectionHeading}><div><p className="section-kicker">UNRESOLVED</p><h2>Recent ingestion errors</h2></div></div>
              <div className={styles.list}>
                {dashboard.errors.length ? dashboard.errors.map((error) => (
                  <article key={error.id}>
                    <div><strong>{error.errorCode ?? "INGESTION_ERROR"}</strong><span>{formatInstant(error.createdAt)}</span></div>
                    <p>{error.errorMessage}</p>
                    <small>{error.providerName ?? "Unknown provider"} · {error.operation}{error.isRetryable ? ` · Retry ${error.retryCount}` : " · Not retryable"}</small>
                  </article>
                )) : <p className={styles.emptyList}>No unresolved ingestion errors.</p>}
              </div>
            </div>
            <div className={styles.section}>
              <div className={styles.sectionHeading}><div><p className="section-kicker">AUDIT</p><h2>Recent manual decisions</h2></div></div>
              <div className={styles.list}>
                {dashboard.overrides.length ? dashboard.overrides.map((override) => (
                  <article key={override.id}>
                    <div><strong>{override.entityType} · {override.fieldName}</strong><span>{formatInstant(override.appliedAt)}</span></div>
                    <p>{override.reason}</p>
                    <small>{override.createdBy}{override.verifiedAt ? ` · verified ${formatInstant(override.verifiedAt)}` : " · unverified"}</small>
                  </article>
                )) : <p className={styles.emptyList}>No manual decisions have been recorded.</p>}
              </div>
            </div>
          </section>

          <AdminControls
            ipos={dashboard.ipos.map((ipo) => ({ id: ipo.id, label: `${ipo.companyName} · ${ipo.status}` }))}
            aliases={dashboard.aliases.map((alias) => ({ id: alias.id, companyId: alias.companyId, externalName: alias.externalName, label: `${alias.externalName} → ${alias.companyName} (${alias.sourceName})` }))}
            fields={dashboard.fieldSources.map((field) => ({ ipoId: field.ipoId, fieldName: field.fieldName, label: `${field.companyName} · ${field.fieldName} · ${field.sourceName}${field.verifiedAt ? " · verified" : ""}` }))}
          />
        </>
      )}
    </main>
  );
}
