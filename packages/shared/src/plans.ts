import type { PlanConfig, SystemSettings } from "@prisma/client";

/**
 * Plan limits and the billing on/off switch are runtime data (PlanConfig /
 * SystemSettings rows, editable from /admin), not compile-time constants —
 * this file only holds the seed defaults and small pure helpers around that
 * data. Nothing here is the source of truth at request time; the database
 * row is.
 */

/** Seed data for the initial four plans — see packages/shared/prisma/seed.ts.
 * After the seed runs, admins edit these from /admin/plans; this array is
 * never read again at runtime. */
export const DEFAULT_PLAN_SEED: Array<
  Pick<PlanConfig, "key" | "name" | "maxConcurrentScans" | "priceMonthlyUsd" | "isDefault" | "sortOrder">
> = [
  { key: "free", name: "Free", maxConcurrentScans: 1, priceMonthlyUsd: 0, isDefault: true, sortOrder: 0 },
  { key: "starter", name: "Starter", maxConcurrentScans: 10, priceMonthlyUsd: 29, isDefault: false, sortOrder: 1 },
  { key: "pro", name: "Pro", maxConcurrentScans: 20, priceMonthlyUsd: 79, isDefault: false, sortOrder: 2 },
  { key: "scale", name: "Scale", maxConcurrentScans: 50, priceMonthlyUsd: 199, isDefault: false, sortOrder: 3 },
];

/**
 * How many concurrent scans a user may have QUEUED or RUNNING right now.
 * Admins are always unlimited, and when billing is globally disabled
 * (SystemSettings.billingEnabled === false) everyone is unlimited — that's
 * the "soft launch, no charging yet" mode.
 */
export function resolveConcurrentScanLimit(params: {
  isAdmin: boolean;
  billingEnabled: boolean;
  plan: Pick<PlanConfig, "maxConcurrentScans"> | null;
}): number | null {
  if (params.isAdmin) return null; // null = unlimited
  if (!params.billingEnabled) return null;
  return params.plan?.maxConcurrentScans ?? 1;
}

export type { PlanConfig, SystemSettings };
