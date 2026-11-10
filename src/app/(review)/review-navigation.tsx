"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  userName: string;
  role: string;
  leadCount: number;
  draftCount: number;
  children: React.ReactNode;
};

const links: { label: string; href: string; job?: "leads" | "drafts" | "all"; count?: "lead" | "draft" }[] = [
  { label: "Leads", href: "/leads", job: "leads", count: "lead" },
  { label: "Drafts", href: "/drafts", job: "drafts", count: "draft" },
  { label: "All", href: "/all", job: "all" },
  { label: "Import", href: "/import" },
  { label: "History", href: "/history" },
] as const;

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
    <header className="review-header">
      <Link className="brand" href="/leads" aria-label="Review home">
        Review
      </Link>
      <nav aria-label="Main navigation">
        {links.map(({ label, href, job, count }) => {
          const current =
            pathname === href || pathname.startsWith(`${href}/`);
          const value =
            count === "lead" ? leadCount : count === "draft" ? draftCount : null;
          return (
            <Link
              key={href}
              className={job ? `tab-link tab-${job}` : "tab-link"}
              data-job={job}
              href={href}
              aria-current={current ? "page" : undefined}
            >
              {label}
              {value !== null && <span className="nav-count">{value}</span>}
            </Link>
          );
        })}
        {role === "admin" && (
          <>
            <Link className="utility-link" href="/users" aria-current={pathname === "/users" ? "page" : undefined}>Users</Link>
            <Link className="utility-link" href="/audit" aria-current={pathname === "/audit" ? "page" : undefined}>Audit</Link>
          </>
        )}
      </nav>
      <div className="user-menu">
        <span className="user-name">{userName}</span>
        <span className="user-role">{role}</span>
        <span className="user-avatar" aria-hidden="true">{initials || "U"}</span>
        {children}
      </div>
    </header>
  );
}
