import Link from "next/link";

export default function NotFound() {
  return (
    <main className="site-container empty-route">
      <p className="section-kicker">404 · RECORD NOT FOUND</p>
      <h1>That market record isn&apos;t here.</h1>
      <p>The IPO may have moved, or the route may be incomplete. Explore the full directory to find the issue you need.</p>
      <Link className="text-link" href="/ipos">Browse IPO directory <span aria-hidden="true">→</span></Link>
    </main>
  );
}
