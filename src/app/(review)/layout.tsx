import { Suspense } from "react";
import { redirect } from "next/navigation";
import LogoutButton from "@/app/logout-button";
import { requireSessionUser } from "@/lib/server/auth/session";
import ReviewNavigation from "./review-navigation";
import ReviewNavigationWithCounts from "./review-navigation-with-counts";

export default async function ReviewLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  const user = await requireSessionUser();
  if (!user.isActive) redirect("/login");
  return (
    <div className="review-shell">
      <Suspense fallback={
        <ReviewNavigation userName={user.name} role={user.role} leadCount={null} draftCount={null}>
          <LogoutButton />
        </ReviewNavigation>
      }>
        <ReviewNavigationWithCounts userName={user.name} role={user.role}>
          <LogoutButton />
        </ReviewNavigationWithCounts>
      </Suspense>
      <main className="review-main">{children}</main>
      {modal}
    </div>
  );
}
