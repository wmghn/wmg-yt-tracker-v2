// Node.js runtime only — có DB access
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { db } from "./lib/db";
import { verifyTOTP } from "./lib/totp";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "Mã 2FA", type: "text" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;

          const user = await db.user.findUnique({
            where: { email: credentials.email as string },
          });

          if (!user || !user.isActive) return null;

          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );
          if (!isValid) return null;

          // Kiểm tra 2FA nếu đã bật
          if (user.twoFactorEnabled && user.twoFactorSecret) {
            const code = (credentials.totpCode as string | undefined)?.replace(/\s/g, "") ?? "";
            if (!code || !verifyTOTP(code, user.twoFactorSecret)) return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role as string,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
});
