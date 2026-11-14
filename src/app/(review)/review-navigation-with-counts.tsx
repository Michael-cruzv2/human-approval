import { getDraftQueueCounts } from "@/lib/server/review/draft-queue";
import { getLeadQueueCount } from "@/lib/server/review/lead-queue";
import ReviewNavigation from "./review-navigation";

export default async function ReviewNavigationWithCounts({
  userName,
  role,
  children,
}: {
  userName: string;
  role: string;
  children: React.ReactNode;
}) {
  const [leadCount, draftCounts] = await Promise.all([
    getLeadQueueCount(),
    getDraftQueueCounts(),
  ]);

  return (
    <ReviewNavigation
      userName={userName}
      role={role}
      leadCount={leadCount}
      draftCount={draftCounts["to-review"]}
    >
      {children}
    </ReviewNavigation>
  );
}
