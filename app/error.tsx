"use client";

import { RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="site-container empty-route" role="alert">
      <p className="section-kicker">PROVIDER UNAVAILABLE</p>
      <h1>This market view couldn&apos;t be loaded.</h1>
      <p>No substitute values have been shown. Retry the request, or return later when the underlying provider is available.</p>
      <button className="retry-button" onClick={reset}><RotateCcw size={13} /> Try again</button>
    </main>
  );
}
