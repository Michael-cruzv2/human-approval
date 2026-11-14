"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  userName: string;
  role: string;
  leadCount: number | null;
  draftCount: number | null;
  children: React.ReactNode;
};

const links: {
  label: string;
  href: string;
  job?: "leads" | "drafts" | "all";
  count?: "lead" | "draft";
}[] = [
  { label: "Leads", href: "/leads", job: "leads", count: "lead" },
  { label: "Drafts", href: "/drafts", job: "drafts", count: "draft" },
  { label: "All", href: "/all", job: "all" },
  { label: "Import", href: "/import" },
  { label: "History", href: "/history" },
];

export default function ReviewNavigation({
  userName,
  role,
  leadCount,
  draftCount,
  children,
}: Props) {
  const pathname = usePathname();
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <header className="topbar">
      <Link className="brand" href="/leads" aria-label="Review home">
        Review
      </Link>
      <nav className="tabs" aria-label="Main navigation">
        {links.map(({ label, href, job, count }) => {
          const current = pathname === href || pathname.startsWith(`${href}/`);
          const value =
            count === "lead" ? leadCount : count === "draft" ? draftCount : null;
          return (
            <Link
              key={href}
              className={job ? `tab-link tab-${job}` : "tab-link tab-secondary"}
              href={href}
              aria-current={current ? "page" : undefined}
            >
              {label}
              {value !== null ? (
                <span className="nav-count">{value}</span>
              ) : count ? (
                <span className="nav-count nav-count-loading" aria-hidden="true" />
              ) : null}
            </Link>
          );
        })}
        {role === "admin" && (
          <>
            <Link
              className="tab-link utility-link tab-secondary"
              href="/users"
              aria-current={pathname === "/users" ? "page" : undefined}
            >
              Users
            </Link>
            <Link
              className="tab-link utility-link tab-secondary"
              href="/audit"
              aria-current={pathname === "/audit" ? "page" : undefined}
            >
              Audit
            </Link>
          </>
        )}
      </nav>
      <details className="user-menu">
        <summary aria-label={`Account menu for ${userName}`}>
          <span className="account-name">{userName}</span>
          <span className="avatar" aria-hidden="true">{initials || "U"}</span>
        </summary>
        <div className="user-menu-panel">
          <div className="meta">
            <strong>{userName}</strong>
            {role === "admin" ? "Administrator" : "Operator"}
          </div>
          {children}
          <nav className="menu-utilities" aria-label="Other sections">
            <Link href="/import">Import</Link>
            <Link href="/history">History</Link>
            {role === "admin" && (
              <>
                <Link href="/users">Users</Link>
                <Link href="/audit">Audit</Link>
              </>
            )}
          </nav>
        </div>
      </details>
    </header>
  );
}
