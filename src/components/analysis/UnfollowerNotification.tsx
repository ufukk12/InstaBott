/**
 * UnfollowerNotification.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Takipten çıkanları göstermek için akıllı bildirim sistemi:
 *   • 0 kişi      → "Kimse takipten çıkmamış!" yeşil toast
 *   • 1-3 kişi    → Her biri için ayrı kırmızı toast (sağ üst köşe)
 *   • 3+ kişi     → Şık modal pencere (ortada, scrollable liste)
 *   • İlk analiz  → Mavi bilgilendirme toastı
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type { IgUser } from "@/lib/instagramApi";
import type { UnfollowerDetectionResult } from "@/lib/unfollowerDetector";

// ─── Toast Bileşeni ───────────────────────────────────────────────────────────

type ToastType = "success" | "danger" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  username?: string;
  profilePicUrl?: string;
}

let toastIdCounter = 0;

function Toast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), 6000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  const bgColor =
    item.type === "success"
      ? "linear-gradient(135deg, #059669, #10b981)"
      : item.type === "danger"
        ? "linear-gradient(135deg, #dc2626, #ef4444)"
        : "linear-gradient(135deg, #2563eb, #3b82f6)";

  return (
    <div
      style={{
        background: bgColor,
        color: "#fff",
        padding: "14px 20px",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        minWidth: "300px",
        maxWidth: "420px",
        animation: "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        cursor: "pointer",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
      onClick={() => onDismiss(item.id)}
      role="alert"
    >
      {item.profilePicUrl && (
        <img
          src={item.profilePicUrl}
          alt=""
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.4)",
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1 }}>
        {item.username && (
          <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: 2 }}>
            @{item.username}
          </div>
        )}
        <div style={{ fontSize: "13px", opacity: 0.95 }}>{item.message}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(item.id);
        }}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "none",
          borderRadius: "6px",
          color: "#fff",
          cursor: "pointer",
          padding: "4px 8px",
          fontSize: "14px",
          flexShrink: 0,
        }}
        aria-label="Kapat"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Modal Bileşeni ───────────────────────────────────────────────────────────

function UnfollowerModal({
  unfollowers,
  newFollowers,
  previousCount,
  currentCount,
  onClose,
}: {
  unfollowers: IgUser[];
  newFollowers: IgUser[];
  previousCount: number;
  currentCount: number;
  onClose: () => void;
}) {
  // ESC tuşu ile kapat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const netChange = currentCount - previousCount;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        animation: "fadeIn 0.3s ease",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          borderRadius: "20px",
          padding: "32px",
          maxWidth: "520px",
          width: "90vw",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "#fff",
          animation: "scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: "40px", marginBottom: 8 }}>📉</div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>
            Takipten Çıkanlar Tespit Edildi
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: "14px", color: "rgba(255,255,255,0.6)" }}>
            Son analizden beri{" "}
            <strong style={{ color: "#ef4444" }}>{unfollowers.length} kişi</strong> seni takipten
            çıktı
            {newFollowers.length > 0 && (
              <>
                , <strong style={{ color: "#10b981" }}>{newFollowers.length} yeni</strong>{" "}
                takipçi geldi
              </>
            )}
          </p>
        </div>

        {/* İstatistik Kartları */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "12px",
            marginBottom: 24,
          }}
        >
          <StatCard label="Önceki" value={previousCount} />
          <StatCard label="Şimdi" value={currentCount} />
          <StatCard
            label="Değişim"
            value={netChange}
            color={netChange >= 0 ? "#10b981" : "#ef4444"}
            prefix={netChange > 0 ? "+" : ""}
          />
        </div>

        {/* Takipten Çıkanlar Listesi */}
        <div style={{ marginBottom: newFollowers.length > 0 ? 20 : 0 }}>
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: 12,
            }}
          >
            🚪 Takipten Çıkanlar ({unfollowers.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unfollowers.map((user) => (
              <UserRow key={user.id ?? user.username} user={user} type="unfollower" />
            ))}
          </div>
        </div>

        {/* Yeni Takipçiler */}
        {newFollowers.length > 0 && (
          <div>
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: 12,
              }}
            >
              🎉 Yeni Takipçiler ({newFollowers.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {newFollowers.slice(0, 10).map((user) => (
                <UserRow key={user.id ?? user.username} user={user} type="new" />
              ))}
              {newFollowers.length > 10 && (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.5)",
                    padding: "8px 0",
                  }}
                >
                  ve {newFollowers.length - 10} kişi daha...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Kapat Butonu */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 24,
            padding: "14px",
            borderRadius: "12px",
            border: "none",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "15px",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.transform = "translateY(-1px)";
            (e.target as HTMLElement).style.boxShadow = "0 8px 24px rgba(99,102,241,0.4)";
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.transform = "none";
            (e.target as HTMLElement).style.boxShadow = "none";
          }}
        >
          Anladım, Kapat
        </button>
      </div>

      {/* Animasyonlar */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Yardımcı Alt Bileşenler ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  prefix = "",
}: {
  label: string;
  value: number;
  color?: string;
  prefix?: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        borderRadius: "12px",
        padding: "14px 12px",
        textAlign: "center",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: color ?? "#fff" }}>
        {prefix}
        {value.toLocaleString("tr-TR")}
      </div>
    </div>
  );
}

function UserRow({ user, type }: { user: IgUser; type: "unfollower" | "new" }) {
  const bgColor =
    type === "unfollower" ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)";
  const borderColor =
    type === "unfollower" ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)";
  const badge = type === "unfollower" ? "🚪 Çıktı" : "🎉 Yeni";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: "10px",
        background: bgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      {user.profile_pic_url ? (
        <img
          src={user.profile_pic_url as string}
          alt=""
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            flexShrink: 0,
          }}
        >
          👤
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          @{user.username}
        </div>
        {user.full_name && (
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user.full_name}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: "11px",
          padding: "3px 8px",
          borderRadius: "6px",
          background: bgColor,
          border: `1px solid ${borderColor}`,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {badge}
      </div>
    </div>
  );
}

// ─── Ana Hook (Adım 5: Akıllı UI Tetikleyici) ───────────────────────────────

/**
 * Unfollower tespit sonucunu alır ve uygun bildirim türünü tetikler:
 *   • 0 kişi    → Yeşil success toast
 *   • 1-3 kişi  → Her biri için ayrı kırmızı toast
 *   • 3+ kişi   → Modal pencere
 *   • İlk analiz → Mavi info toast
 *
 * Kullanım:
 *   const { notify, toastContainer, modal } = useUnfollowerNotification();
 *   // Analiz bittikten sonra:
 *   notify(detectionResult);
 *   // JSX'e ekle:
 *   {toastContainer}
 *   {modal}
 */
export function useUnfollowerNotification() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modalData, setModalData] = useState<{
    unfollowers: IgUser[];
    newFollowers: IgUser[];
    previousCount: number;
    currentCount: number;
  } | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string, user?: IgUser) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [
      ...prev,
      {
        id,
        type,
        message,
        username: user?.username,
        profilePicUrl: user?.profile_pic_url as string | undefined,
      },
    ]);
  }, []);

  const notify = useCallback(
    (result: UnfollowerDetectionResult) => {
      // ─── İlk Analiz ──────────────────────────────────────────────────
      if (result.status === "first_run") {
        addToast(
          "info",
          `İlk analiz tamamlandı! ${result.currentCount.toLocaleString("tr-TR")} takipçi kaydedildi. Bir sonraki analizde takipten çıkanlar tespit edilecek.`
        );
        return;
      }

      // ─── 0 kişi çıkmış → Harika! ─────────────────────────────────────
      if (result.unfollowers.length === 0) {
        const msg =
          result.newFollowers.length > 0
            ? `Kimse takipten çıkmamış! Üstelik ${result.newFollowers.length} yeni takipçi geldi 🎉`
            : "Kimse takipten çıkmamış, harika! 🎉";
        addToast("success", msg);
        return;
      }

      // ─── 1-3 kişi → Ayrı ayrı toast ──────────────────────────────────
      if (result.unfollowers.length <= 3) {
        for (const user of result.unfollowers) {
          addToast("danger", "seni takipten çıktı!", user);
        }
        return;
      }

      // ─── 3+ kişi → Modal pencere ──────────────────────────────────────
      setModalData({
        unfollowers: result.unfollowers,
        newFollowers: result.newFollowers,
        previousCount: result.previousCount,
        currentCount: result.currentCount,
      });
    },
    [addToast]
  );

  // ─── Toast Container (sağ üst köşe) ────────────────────────────────────
  const toastContainer = (
    <>
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {toasts.map((t) => (
            <Toast key={t.id} item={t} onDismiss={dismissToast} />
          ))}
        </div>
      )}
      {/* Animasyon keyframes */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );

  // ─── Modal ──────────────────────────────────────────────────────────────
  const modal = modalData ? (
    <UnfollowerModal
      unfollowers={modalData.unfollowers}
      newFollowers={modalData.newFollowers}
      previousCount={modalData.previousCount}
      currentCount={modalData.currentCount}
      onClose={() => setModalData(null)}
    />
  ) : null;

  return { notify, toastContainer, modal };
}
