"use client";

import { useState } from "react";
import {
  adminIpoFieldLabels,
  adminIpoFields,
  adminSyncJobs,
  type AdminIpoField,
} from "@/lib/admin/contracts";
import styles from "./page.module.css";

type Option = { id: string; label: string };
type AliasOption = Option & { externalName: string; companyId: string };
type FieldOption = { ipoId: string; fieldName: string; label: string };

type Props = {
  ipos: Option[];
  aliases: AliasOption[];
  fields: FieldOption[];
};

type Notice = { tone: "success" | "error"; message: string } | null;

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function AdminControls({ ipos, aliases, fields }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(action: string, payload: Record<string, unknown>) {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/data-control", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-artha-admin-action": "1",
        },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "The action was rejected.");
      setNotice({ tone: "success", message: body?.message ?? "The action completed." });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "The action failed." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.controls} aria-labelledby="data-controls-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className="section-kicker">CONTROL PLANE</p>
          <h2 id="data-controls-title">Verified data actions</h2>
        </div>
        <p>Every change is allowlisted, attributed to your signed-in identity, timestamped, and retained in the override audit.</p>
      </div>

      {notice ? (
        <div className={notice.tone === "success" ? styles.success : styles.failure} role="status">
          {notice.message}
        </div>
      ) : null}

      <div className={styles.controlGrid}>
        <form
          className={styles.controlCard}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void submit("resync", { action: "resync", job: text(form, "job") });
          }}
        >
          <span className={styles.cardNumber}>01</span>
          <h3>Request a resync</h3>
          <p>Runs only an explicitly supported ingestion job through the protected internal scheduler.</p>
          <label>Job<select name="job" defaultValue="all">{adminSyncJobs.map((job) => <option key={job} value={job}>{job}</option>)}</select></label>
          <button disabled={busy !== null} type="submit">{busy === "resync" ? "Running…" : "Run sync"}</button>
        </form>

        <form
          className={styles.controlCard}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const rawValue = text(form, "value");
            void submit("override", {
              action: "override_ipo_field",
              ipoId: text(form, "ipoId"),
              field: text(form, "field"),
              value: rawValue === "" ? null : rawValue,
              reason: text(form, "reason"),
            });
          }}
        >
          <span className={styles.cardNumber}>02</span>
          <h3>Override an IPO field</h3>
          <p>Creates selected manual provenance and supersedes the prior value without deleting its history.</p>
          <label>IPO<select name="ipoId" required defaultValue=""><option value="" disabled>Select an IPO</option>{ipos.map((ipo) => <option key={ipo.id} value={ipo.id}>{ipo.label}</option>)}</select></label>
          <label>Field<select name="field" defaultValue="status">{adminIpoFields.map((field) => <option key={field} value={field}>{adminIpoFieldLabels[field as AdminIpoField]}</option>)}</select></label>
          <label>Verified value<input name="value" maxLength={500} placeholder="Leave empty only to clear nullable fields" /></label>
          <label>Reason<textarea name="reason" minLength={8} maxLength={500} required /></label>
          <button disabled={busy !== null || ipos.length === 0} type="submit">{busy === "override" ? "Applying…" : "Apply verified override"}</button>
        </form>

        <form
          className={styles.controlCard}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const observed = text(form, "observedAt");
            void submit("gmp", {
              action: "record_gmp",
              ipoId: text(form, "ipoId"),
              gmp: text(form, "gmp"),
              upperPriceBand: text(form, "upperPriceBand") || undefined,
              observedAt: new Date(observed).toISOString(),
              sourceUrl: text(form, "sourceUrl") || undefined,
              reason: text(form, "reason"),
            });
          }}
        >
          <span className={styles.cardNumber}>03</span>
          <h3>Record manual GMP</h3>
          <p>Stores a timestamped, unofficial GMP observation. It never presents the entry as exchange or regulator data.</p>
          <label>IPO<select name="ipoId" required defaultValue=""><option value="" disabled>Select an IPO</option>{ipos.map((ipo) => <option key={ipo.id} value={ipo.id}>{ipo.label}</option>)}</select></label>
          <div className={styles.splitFields}>
            <label>GMP<input name="gmp" inputMode="decimal" placeholder="25 or -4" required /></label>
            <label>Upper band<input name="upperPriceBand" inputMode="decimal" placeholder="Optional" /></label>
          </div>
          <label>Observed at<input name="observedAt" type="datetime-local" required /></label>
          <label>Source URL<input name="sourceUrl" type="url" inputMode="url" placeholder="https://… (optional)" /></label>
          <label>Reason<textarea name="reason" minLength={8} maxLength={500} required /></label>
          <button disabled={busy !== null || ipos.length === 0} type="submit">{busy === "gmp" ? "Recording…" : "Record observation"}</button>
        </form>

        <form
          className={styles.controlCard}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const aliasIndex = Number(text(form, "aliasIndex"));
            const alias = aliases[aliasIndex];
            if (!alias) return;
            void submit("alias", {
              action: "correct_alias",
              aliasId: alias.id,
              externalName: text(form, "externalName"),
              companyId: text(form, "companyId") || undefined,
              reason: text(form, "reason"),
            });
          }}
        >
          <span className={styles.cardNumber}>04</span>
          <h3>Correct a company alias</h3>
          <p>Normalizes and verifies a provider-specific company name; an optional company ID can repair a mapping.</p>
          <label>Alias<select name="aliasIndex" required defaultValue=""><option value="" disabled>Select an alias</option>{aliases.map((alias, index) => <option key={alias.id} value={index}>{alias.label}</option>)}</select></label>
          <label>Correct external name<input name="externalName" minLength={2} maxLength={240} required /></label>
          <label>Target company ID<input name="companyId" maxLength={128} placeholder="Optional; keep current mapping by default" /></label>
          <label>Reason<textarea name="reason" minLength={8} maxLength={500} required /></label>
          <button disabled={busy !== null || aliases.length === 0} type="submit">{busy === "alias" ? "Correcting…" : "Verify correction"}</button>
        </form>

        <form
          className={styles.controlCard}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const fieldIndex = Number(text(form, "fieldIndex"));
            const field = fields[fieldIndex];
            if (!field) return;
            void submit("verify", {
              action: "verify_field",
              ipoId: field.ipoId,
              fieldName: field.fieldName,
              reason: text(form, "reason"),
            });
          }}
        >
          <span className={styles.cardNumber}>05</span>
          <h3>Mark a selected field verified</h3>
          <p>Confirms the currently selected provenance record without changing its normalized value.</p>
          <label>Selected field<select name="fieldIndex" required defaultValue=""><option value="" disabled>Select a field</option>{fields.map((field, index) => <option key={`${field.ipoId}:${field.fieldName}`} value={index}>{field.label}</option>)}</select></label>
          <label>Verification reason<textarea name="reason" minLength={8} maxLength={500} required /></label>
          <button disabled={busy !== null || fields.length === 0} type="submit">{busy === "verify" ? "Verifying…" : "Mark verified"}</button>
        </form>
      </div>
    </section>
  );
}
