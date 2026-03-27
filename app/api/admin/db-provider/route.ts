import { NextResponse } from "next/server";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isLocal = dbUrl.startsWith("file:");

  return NextResponse.json({
    provider: isLocal ? "sqlite" : "postgresql",
    label: isLocal ? "SQLite (Local)" : "Supabase PostgreSQL",
    isLocal,
  });
}
