import styles from "@/features/ipo-detail/ipo-detail.module.css";

export default function Loading() {
  return (
    <main className={styles.loadingPage} aria-busy="true" aria-label="Loading IPO details">
      <div className={styles.loadingHeader}>
        <span />
        <div><i /><i /><i /></div>
      </div>
      <div className={styles.loadingMetrics}>
        {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
      </div>
      <div className={styles.loadingNav} />
      <div className={styles.loadingSection}><i /><i /><i /><i /></div>
      <p className={styles.srOnly}>Loading IPO details…</p>
    </main>
  );
}
