import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }) as any;
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = await bcrypt.hash("Admin@123", 10);

  const director = await prisma.user.upsert({
    where: { email: "director@company.com" },
    update: {},
    create: {
      name: "Giám đốc",
      email: "director@company.com",
      password,
      role: "DIRECTOR",
      baseSalary: 20000000,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@company.com" },
    update: {},
    create: {
      name: "Quản lý",
      email: "manager@company.com",
      password,
      role: "MANAGER",
      baseSalary: 15000000,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "staff@company.com" },
    update: {},
    create: {
      name: "Nhân viên",
      email: "staff@company.com",
      password,
      role: "STAFF",
      baseSalary: 10000000,
    },
  });

  // Seed default permission configs
  const metrics = ["REVENUE", "VIEWS", "CPM", "RPM", "IMPRESSIONS"] as const;
  for (const metric of metrics) {
    await prisma.permissionConfig.upsert({
      where: { metric },
      update: {},
      create: {
        metric,
        allowedRoles: ["DIRECTOR"],
        createdBy: director.id,
      },
    });
  }

  const defaultMetrics = [
    { metricKey: "views", metricLabel: "Views", allowedRoles: ["DIRECTOR","MANAGER","STAFF"] as const, isDefault: true, sortOrder: 1 },
    { metricKey: "watchTime", metricLabel: "Watch time (hours)", allowedRoles: ["DIRECTOR","MANAGER"] as const, isDefault: true, sortOrder: 2 },
    { metricKey: "avgViewDuration", metricLabel: "Average view duration", allowedRoles: ["DIRECTOR","MANAGER"] as const, isDefault: false, sortOrder: 3 },
    { metricKey: "subscribers", metricLabel: "Subscribers gained", allowedRoles: ["DIRECTOR","MANAGER"] as const, isDefault: false, sortOrder: 4 },
    { metricKey: "impressions", metricLabel: "Impressions", allowedRoles: ["DIRECTOR","MANAGER"] as const, isDefault: false, sortOrder: 5 },
    { metricKey: "ctr", metricLabel: "Impression CTR (%)", allowedRoles: ["DIRECTOR","MANAGER"] as const, isDefault: false, sortOrder: 6 },
    { metricKey: "revenue", metricLabel: "Revenue (USD)", allowedRoles: ["DIRECTOR"] as const, isDefault: true, sortOrder: 7 },
    { metricKey: "cpm", metricLabel: "CPM", allowedRoles: ["DIRECTOR"] as const, isDefault: false, sortOrder: 8 },
    { metricKey: "likes", metricLabel: "Likes", allowedRoles: ["DIRECTOR","MANAGER","STAFF"] as const, isDefault: false, sortOrder: 10 },
  ];

  for (const m of defaultMetrics) {
    await prisma.metricPermission.upsert({
      where: { metricKey: m.metricKey },
      update: {},
      create: {
        metricKey: m.metricKey,
        metricLabel: m.metricLabel,
        allowedRoles: [...m.allowedRoles],
        isDefault: m.isDefault,
        sortOrder: m.sortOrder,
        updatedBy: director.id,
      },
    });
  }

  console.log("Seeded accounts:");
  console.log(`  Director: director@company.com / Admin@123`);
  console.log(`  Manager:  manager@company.com / Admin@123`);
  console.log(`  Staff:    staff@company.com / Admin@123`);

  return { director, manager, staff };
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
