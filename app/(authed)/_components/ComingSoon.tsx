import Link from "next/link";
import type { ReactNode } from "react";
import { blueButtonClassName } from "@/components/ui/BlueButton";

/**
 * Placeholder body for a nav destination that has no implementation yet.
 * Every sidebar entry must land on a real page — a missing route renders the
 * framework error page, which reads as a broken app rather than unbuilt work.
 */
export type ComingSoonProps = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  headline: string;
  description: string;
  /** Short "what this page will do" lines, shown as a preview list. */
  planned: string[];
};

export default function ComingSoon({
  title,
  subtitle,
  icon,
  headline,
  description,
  planned,
}: ComingSoonProps) {
  return (
    <div className="placeholder-view">
      <header className="placeholder-topbar">
        <div>
          <h1 className="placeholder-topbar-title">{title}</h1>
          <p className="placeholder-topbar-sub">{subtitle}</p>
        </div>
        <span className="placeholder-pill">Coming soon</span>
      </header>

      <div className="placeholder-body">
        <section className="placeholder-card">
          <span className="placeholder-icon" aria-hidden="true">
            {icon}
          </span>
          <h2 className="placeholder-headline">{headline}</h2>
          <p className="placeholder-description">{description}</p>

          <ul className="placeholder-planned">
            {planned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div className="placeholder-actions">
            <Link href="/home" className={blueButtonClassName("primary")}>
              Go to Diagnose
            </Link>
            <Link href="/patients" className={blueButtonClassName("secondary")}>
              Browse patients
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
