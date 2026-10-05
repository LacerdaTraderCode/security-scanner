import { PrismaClient } from "@prisma/client";
import { DEFAULT_PLAN_SEED } from "../src/plans";

const prisma = new PrismaClient();

/**
 * Idempotent — safe to run on every deploy, not just once. Upserts the four
 * default plans (by their stable `key`) and ensures exactly one
 * SystemSettings row exists, defaulting billingEnabled to false so a fresh
 * deploy never starts charging people before an admin flips it on.
 */
async function main() {
  for (const plan of DEFAULT_PLAN_SEED) {
    await prisma.planConfig.upsert({
      where: { key: plan.key },
      create: plan,
      // Only create on first run — an admin may have since edited the
      // name/price/limit from /admin/plans, and a reseed must not clobber that.
      update: {},
    });
  }

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, billingEnabled: false },
    update: {},
  });

  console.log("Seed complete: 4 plans ensured, SystemSettings row ensured.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
