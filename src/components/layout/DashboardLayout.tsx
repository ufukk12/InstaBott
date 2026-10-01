"use client";

import React from "react";
import Sidebar from "./Sidebar";
import { usePathname } from "next/navigation";
import { useUser } from "@/context/UserContext";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  // Aşağıdaki prop'lar artık opsiyonel — varsayılan olarak UserContext'ten okunur.
  // Geriye dönük uyumluluk için bırakıldı.
  displayId?: string;
  followerTokens?: number;
  email?: string;
}

export default function DashboardLayout({
  children,
  activePath,
  displayId: displayIdProp,
  followerTokens: followerTokensProp,
  email: emailProp,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const { user } = useUser();

  // PERFORMANS: `isMobile` state'i kaldırıldı. Eskiden false başlayıp useEffect ile
  // düzeltiliyordu; bu, ilk boyamanın marginLeft:0 ile yapılıp ardından 260px'e
  // atlaması demekti — üstelik `transition: margin-left .3s` bunu 300ms'lik görünür
  // bir kaymayla animasyonluyordu. Artık genişlik CSS medya sorgusuyla belirleniyor:
  // ilk boyama doğru, kayma yok, geçiş anlık.

  // Context'ten oku; prop varsa onu kullan (geriye dönük uyumluluk)
  const displayId = displayIdProp ?? user?.displayId ?? "---";
  const followerTokens = followerTokensProp ?? user?.followerTokens ?? 0;
  const email = emailProp ?? user?.email ?? "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex" }}>
      <Sidebar
        activePath={activePath || pathname || "/dashboard"}
        displayId={displayId}
        followerTokens={followerTokens}
        email={email}
      />
      <div className="dashboard-content">{children}</div>
    </div>
  );
}
