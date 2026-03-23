// Server component — đọc session và redirect đúng dashboard theo role
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";

const ROLE_HOME: Record<string, string> = {
  DIRECTOR: "/director/analytics",
  MANAGER: "/manager/analytics",
  STAFF: "/staff/analytics",
};

export default async function DashboardRedirectPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role: string }).role;
  redirect(ROLE_HOME[role] ?? "/login");
}
