// Server-side auth helpers — Node.js runtime only
import { auth } from "@/auth";

export { signIn, signOut, handlers } from "@/auth";

export async function getServerSession() {
  return await auth();
}

export async function requireAuth() {
  const session = await getServerSession();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireRole(role: string | string[]) {
  const session = await requireAuth();
  const userRole = session.user.role as string;
  const allowedRoles = Array.isArray(role) ? role : [role];
  if (!allowedRoles.includes(userRole)) throw new Error("FORBIDDEN");
  return session;
}

export async function getCurrentUser() {
  const session = await requireAuth();
  const { db } = await import("@/lib/db");
  const userId = session.user?.id;
  if (!userId) throw new Error("USER_NOT_FOUND");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("USER_NOT_FOUND");
  return user;
}
