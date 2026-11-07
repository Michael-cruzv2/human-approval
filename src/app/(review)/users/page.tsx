import { redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/lib/server/auth/session";
import UsersAdmin from "./users-admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <UsersAdmin />;
}
