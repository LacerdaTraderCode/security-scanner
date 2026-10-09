import { PrismaClient } from "@prisma/client";
import { BillingToggle } from "@/components/admin/BillingToggle";

const prisma = new PrismaClient();

export default async function AdminSettingsPage() {
  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, billingEnabled: false },
    update: {},
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-100 mb-1">Settings</h1>
      <p className="text-slate-500 text-sm mb-6">Global switches that apply to every account.</p>
      <BillingToggle initialEnabled={settings.billingEnabled} />
    </div>
  );
}
