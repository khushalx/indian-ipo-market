import Link from "next/link";
import styles from "@/features/ipo-detail/ipo-detail.module.css";

export default function NotFound() {
  return (
    <main className={styles.unavailablePage}>
      <p>IPO NOT FOUND</p>
      <h1>This issue isn&apos;t in our coverage.</h1>
      <span>Check the company name or browse the complete IPO directory.</span>
      <Link href="/ipos">Browse all IPOs</Link>
    </main>
  );
}
