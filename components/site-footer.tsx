import Link from "next/link";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`site-container ${styles.disclaimer}`}>
        <strong>Important information</strong>
        <p>Market data is provided for informational purposes only and does not constitute investment advice. Grey Market Premium is unofficial market information and does not guarantee listing performance. Phase 1 values are clearly marked development data.</p>
      </div>
      <div className={`site-container ${styles.bottom}`}>
        <Link href="/" className={styles.brand}><span>अ</span> ARTHA IPO</Link>
        <p>Indian primary market intelligence, built around clarity and source traceability.</p>
        <nav aria-label="Footer navigation"><Link href="/ipos">IPOs</Link><Link href="/calendar">Calendar</Link><Link href="/compare">Compare</Link></nav>
      </div>
    </footer>
  );
}
