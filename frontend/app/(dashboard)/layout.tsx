import { AppShell } from "@/components/layout/app-shell";
import { PageFade } from "@/components/layout/page-fade";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <PageFade>{children}</PageFade>
    </AppShell>
  );
}
