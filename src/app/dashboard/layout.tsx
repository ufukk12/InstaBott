/**
 * Dashboard Grup Layout'u
 *
 * /dashboard ve tüm alt rotaları (/dashboard/account, /dashboard/watcher…) bu layout
 * tarafından sarmalanır.
 *
 * PERFORMANS — NEDEN KABUK BURADA:
 * Next.js App Router, gezinme sırasında LAYOUT'ları korur ve yalnızca sayfayı yeniden
 * render eder. Sidebar eskiden her sayfanın İÇİNDE render ediliyordu; bu yüzden her
 * menü tıklamasında komple yıkılıp yeniden kuruluyordu (effect'ler yeniden çalışıyor,
 * state sıfırlanıyor, ilk boyamada layout kayması oluşuyordu).
 *
 * Kabuğu buraya alarak Sidebar bir kez mount edilir ve gezinmede yalnızca içerik
 * alanı değişir — geçişler anlık olur.
 */

import { UserProvider } from "@/context/UserContext";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </UserProvider>
  );
}
