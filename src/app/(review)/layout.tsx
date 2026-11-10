import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/app/logout-button";
import { requireSessionUser } from "@/lib/server/auth/session";

const links = [
  ["Leads", "/leads"],
  ["Drafts", "/drafts"],
  ["All", "/all"],
  ["Import", "/import"],
  ["History", "/history"],
] as const;

export default async function ReviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireSessionUser();
  if (!user.isActive) redirect("/login");
  return (
    <div className="review-shell">
      <header className="review-header">
        <Link className="brand" href="/leads">Lead Review</Link>
        <nav aria-label="Main navigation">
          {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          {user.role === "admin" && <Link href="/users">Users</Link>}
          {user.role === "admin" && <Link href="/audit">Audit</Link>}
        </nav>
        <div className="user-menu">
          <span>{user.name} · {user.role}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="review-main">{children}</main>
    </div>
  );
}
