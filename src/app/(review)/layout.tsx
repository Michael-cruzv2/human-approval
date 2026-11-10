import { redirect } from "next/navigation";
import LogoutButton from "@/app/logout-button";
import { requireSessionUser } from "@/lib/server/auth/session";
import { getDraftQueueCounts } from "@/lib/server/review/draft-queue";
import { getLeadQueueCount } from "@/lib/server/review/lead-queue";
import ReviewNavigation from "./review-navigation";

export default async function ReviewLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  const user = await requireSessionUser();
  if (!user.isActive) redirect("/login");
  const [leadCount, draftCounts] = await Promise.all([
    getLeadQueueCount(),
    getDraftQueueCounts(),
  ]);
  return (
    <div className="review-shell">
      <ReviewNavigation
        userName={user.name}
        role={user.role}
        leadCount={leadCount}
        draftCount={draftCounts["to-review"]}
      >
        <LogoutButton />
      </ReviewNavigation>
      <main className="review-main">{children}</main>
      {modal}
    </div>
  );
}
