export default function Loading() {
  return (
    <main className="site-container route-loading" aria-busy="true" aria-label="Loading market information">
      <div className="skeleton skeleton-kicker" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-table" />
    </main>
  );
}
