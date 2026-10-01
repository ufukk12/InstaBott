"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";

interface SidebarProps {
  activePath: string;
  displayId: string;
  followerTokens: number;
  email: string;
}

export default function Sidebar({
  activePath,
  displayId,
  followerTokens,
  email,
}: SidebarProps) {
  const router = useRouter();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);

    const handleLock = (e: any) => setIsLocked(e.detail);
    window.addEventListener("analysisStateChange", handleLock);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("analysisStateChange", handleLock);
    };
  }, []);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(displayId);
    alert("Kullanıcı ID kopyalandı!");
  };

  /**
   * ÇIKIŞ SENKRONİZASYONU
   *
   * Analiz tarayıcıda bir promise zinciri olarak sürer; çıkış yapmak veya sayfa
   * değiştirmek onu kendiliğinden DURDURMAZ — sessionId closure'da tutulduğu için
   * gözcü hesap adına istek atmaya devam eder. Bu yüzden sırayla:
   *   1. Devam eden analize iptal sinyali gönder (bir sonraki istekten önce durur)
   *   2. Analiz kilidini serbest bırak (yarıda kalan kilit sonraki girişi engellemesin)
   *   3. Oturum jetonunu ve TÜM yerel veriyi sil (gözcü oturumu dahil)
   */
  const handleLogout = async () => {
    if (isLocked) {
      const onay = window.confirm(
        "Analiz şu anda devam ediyor.\n\n" +
          "Çıkış yaparsanız analiz durdurulacak, gözcü hesabın oturumu kapatılacak ve " +
          "o ana kadar çekilen veriler silinecek.\n\nDevam edilsin mi?"
      );
      if (!onay) return;
    }

    const [{ requestAnalysisAbort }, { wipeAllLocalData, releaseAnalysisLock }] = await Promise.all([
      import("@/lib/instagramClient"),
      import("@/lib/idb"),
    ]);

    // 1. Arka plandaki gözcü trafiğini kes
    requestAnalysisAbort();

    // 2. Kilitleri bırak — hata olsa bile akış devam etsin
    await Promise.all([
      releaseAnalysisLock("main").catch(() => {}),
      releaseAnalysisLock("ghost").catch(() => {}),
    ]);

    // 3. Hiçbir iz bırakma
    localStorage.removeItem("auth_token");
    await wipeAllLocalData().catch(() => {});

    router.push("/login");
  };

  const navItems = [
    { name: "Analiz Masası", path: "/dashboard", icon: "📊" },
    { name: "Gözcü Hesap", path: "/dashboard/watcher", icon: "🛰️" },
    { name: "Hesap Sağlığı", path: "/dashboard/health", icon: "🩺" },
    { name: "Hesap Bilgileri", path: "/dashboard/account", icon: "👤" },
    { name: "Satın Alma Geçmişi", path: "/dashboard/purchases", icon: "🛒" },
  ];

  return (
    <>
      {isMobile && (
        <button 
          onClick={() => setIsOpen(!isOpen)}
          style={{
            position: "fixed",
            top: "16px",
            left: "16px",
            zIndex: 60,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "8px 12px",
            cursor: "pointer",
            boxShadow: "var(--shadow-card)"
          }}
        >
          ☰
        </button>
      )}

      {isMobile && isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 40
          }}
        />
      )}

      <div style={{
          width: "260px",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          // Daha açık ve ferah ton (eski: #0f172a → #1e293b).
          // Beyaz metin kontrastı korunuyor: #334155 üzerinde beyaz ≈ 9:1 (WCAG AAA).
          background: "linear-gradient(180deg, #1e293b 0%, #334155 100%)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          color: "white",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          zIndex: 50,
          transition: "transform 0.3s ease",
          transform: isMobile && !isOpen ? "translateX(-100%)" : "translateX(0)",
      }}>
          {/* Header */}
          <div style={{ marginBottom: "32px", padding: "0 8px", marginTop: isMobile ? "40px" : "0" }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0 }} className="gradient-text">
              InstaTracker
            </h2>
          </div>

          {/* User Badge */}
          <div 
            onClick={handleCopy}
            style={{
              // Arka plan açıldığı için yarı saydam katmanlar bir tık güçlendirildi,
              // böylece algılanan kontrast eskisiyle aynı kaldı.
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "12px",
              padding: "12px",
              marginBottom: "16px",
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              transition: "background 0.2s"
            }}
          >
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af", fontWeight: 600 }}>KULLANICI ID</p>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.95rem", fontWeight: 700, letterSpacing: "1px" }}>{displayId}</p>
          </div>

          {/* Token Counter */}
          <div style={{
            background: "rgba(16, 185, 129, 0.14)",
            border: "1px solid rgba(16, 185, 129, 0.28)",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "32px",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
            <span style={{ fontSize: "1.2rem" }}>🪙</span>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: "1rem" }}>{followerTokens} Token</span>
          </div>

          {/* Nav Items */}
          <nav style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            {navItems.map((item) => {
              const isActive = activePath === item.path;
              const content = (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    background: isActive ? "rgba(236, 72, 153, 0.15)" : "transparent",
                    borderLeft: isActive ? "4px solid #ec4899" : "4px solid transparent",
                    color: isActive ? "#ec4899" : "#e2e8f0",
                    transition: "all 0.2s ease",
                    opacity: isLocked && !isActive ? 0.5 : 1,
                  }}>
                    <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
                    <span style={{ fontWeight: isActive ? 600 : 500, fontSize: "0.95rem" }}>{item.name}</span>
                  </div>
              );

              return isLocked ? (
                <div 
                  key={item.path} 
                  style={{ textDecoration: "none", cursor: "not-allowed" }}
                  onClick={() => alert("Analiz devam ederken sekme değiştiremezsiniz! Lütfen analizin bitmesini bekleyin.")}
                >
                  {content}
                </div>
              ) : (
                <Link key={item.path} href={item.path} style={{ textDecoration: "none" }}>
                  {content}
                </Link>
              );
            })}
          </nav>

          {/* Buy Button */}
          {isLocked ? (
            <div style={{ textDecoration: "none", marginBottom: "16px", cursor: "not-allowed" }} onClick={() => alert("Analiz devam ederken sekme değiştiremezsiniz!")}>
              <button className="btn-primary" style={{ width: "100%", padding: "14px", fontSize: "0.9rem", opacity: 0.5, pointerEvents: "none" }}>
                FollowerToken Satın Al
              </button>
            </div>
          ) : (
            <Link href="/dashboard/purchases" style={{ textDecoration: "none", marginBottom: "16px" }}>
              <button className="btn-primary" style={{ width: "100%", padding: "14px", fontSize: "0.9rem" }}>
                FollowerToken Satın Al
              </button>
            </Link>
          )}

          {/* Logout */}
          <button 
            // DEĞİŞİKLİK: Çıkış artık analiz sırasında da mümkün. Eskiden tamamen
            // engelleniyordu — bu, gözcü oturumunu kapatmak isteyen kullanıcıyı
            // analizin bitmesini beklemeye zorluyordu (güvenlik açısından ters).
            // Onay istenip analiz durduruluyor.
            onClick={handleLogout}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#9ca3af",
              padding: "12px",
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontWeight: 600,
              fontSize: "0.9rem"
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)" }}
            onMouseOut={(e) => { e.currentTarget.style.background = "transparent" }}
          >
            {isLocked ? "Çıkış Yap (analizi durdurur)" : "Çıkış Yap"}
          </button>
      </div>
    </>
  );
}
