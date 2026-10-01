"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { getAuthData, saveAuthData, clearAllAnalysisData } from "@/lib/idb";
import AnalysisDashboard from "@/components/analysis/AnalysisDashboard";
import SessionIdForm from "@/components/watcher/SessionIdForm";
import { useUser } from "@/context/UserContext";

type AuthState = {
  sessionId: string;
  targetUsername: string;
  targetId: string;
} | null;

export default function DashboardPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState>(null);
  const [loading, setLoading] = useState(true);
  const [sessionModal, setSessionModal] = useState(false);
  const [targetModal, setTargetModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { user } = useUser();

  // Sayfa açılışında IndexedDB'den auth oku
  useEffect(() => {
    async function checkAuth() {
      const data = await getAuthData();
      if (!data?.sessionId || !data?.targetId) {
        router.replace("/onboarding");
        return;
      }
      setAuth(data);
      setLoading(false);
    }
    checkAuth();
  }, [router]);

  // Session patladığında AnalysisDashboard'dan tetiklenecek callback
  const handleSessionExpired = useCallback(() => {
    setSessionModal(true);
  }, []);

  // SessionID başarıyla güncellenince
  const handleSessionUpdated = useCallback(async (newSessionId: string) => {
    if (!auth) return;
    await saveAuthData(newSessionId, auth.targetUsername, auth.targetId);
    setAuth({ ...auth, sessionId: newSessionId });
    setSessionModal(false);
  }, [auth]);

  // Hedef Hesap güncellenince
  const handleTargetUpdated = useCallback(async (newTargetUsername: string, newTargetId: string) => {
    if (!auth) return;
    await saveAuthData(auth.sessionId, newTargetUsername, newTargetId);
    
    // YENİ: IDB'yi tamamen silme (clearAllAnalysisData kaldırıldı),
    // Sadece localStorage'da yeni hedefi sakla (Stage 1)
    if (user?.email) {
      localStorage.setItem(
        `lastTarget_${user.email}`,
        JSON.stringify({ targetUsername: newTargetUsername, targetId: newTargetId })
      );
    }

    setAuth({ ...auth, targetUsername: newTargetUsername, targetId: newTargetId });
    setTargetModal(false);
    setToastMessage("Hedef hesap başarıyla değiştirildi. Yeni hedef analiz edilmeye hazır.");
    setTimeout(() => setToastMessage(null), 4000);
  }, [auth, user?.email]);

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--color-text-muted)", fontSize: "1rem" }}>Yükleniyor...</p>
      </main>
    );
  }

  return (
    <>
      <div className="container-xl" style={{ maxWidth: 1000, position: "relative" }}>
        
        {/* Toast Mesajı */}
        {toastMessage && (
          <div style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "#10b981",
            color: "white",
            padding: "12px 20px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "0.9rem",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
            zIndex: 100,
            animation: "fade-in-down 0.3s ease-out"
          }}>
            ✓ {toastMessage}
          </div>
        )}

        <div
          className="feature-card anim-fade-up"
          style={{ padding: "36px 32px", overflow: "visible" }}
        >
          <AnalysisDashboard
            key={auth?.targetUsername || "empty"}
            targetUsername={auth?.targetUsername || ""}
            onSessionExpired={handleSessionExpired}
            onChangeTarget={() => setTargetModal(true)}
            onRequireNewSession={() => setSessionModal(true)}
          />
        </div>
      </div>

      {/* SessionID Güncelle Modalı */}
      {sessionModal && (
        <SessionUpdateModal
          onUpdate={handleSessionUpdated}
          onClose={() => setSessionModal(false)}
        />
      )}

      {/* Hedef Hesap Güncelle Modalı */}
      {targetModal && (
        <TargetUpdateModal
          sessionId={auth?.sessionId || ""}
          onUpdate={handleTargetUpdated}
          onClose={() => setTargetModal(false)}
        />
      )}
    </>
  );
}

// ─── SessionID Güncelle Modalı ─────────────────────────────────────────────────

function SessionUpdateModal({
  onUpdate,
  onClose,
}: {
  onUpdate: (newSessionId: string, username: string) => void;
  onClose: () => void;
}) {
  // Form mantığı (doğrulama isteği, hata eşlemesi, gözcü bilgisinin kaydı)
  // SessionIdForm içinde TEK yerde duruyor — burada yalnızca modal kabuğu var.
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,46,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        className="anim-fade-up"
        style={{
          background: "var(--color-surface)",
          borderRadius: 20,
          padding: "30px 28px",
          maxWidth: 480,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: "2.2rem" }}>🔑</span>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "10px 0 4px" }}>
            Session ID Güncelle
          </h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.88rem", margin: 0, lineHeight: 1.5 }}>
            Mevcut oturumunuz sona ermiş. Gözcü hesabınızın güncel Session ID&apos;sini girerek analize devam edebilirsiniz.
          </p>
        </div>

        <SessionIdForm
          onVerified={onUpdate}
          onCancel={onClose}
          submitLabel="Güncelle ve Devam Et"
          autoFocus
        />
      </div>
    </div>
  );
}



// ─── Hedef Hesap Güncelle Modalı ───────────────────────────────────────────────

function TargetUpdateModal({
  sessionId,
  onUpdate,
  onClose,
}: {
  sessionId: string;
  onUpdate: (newTargetUsername: string, newTargetId: string) => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const [newTarget, setNewTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    const trimmedUsername = newTarget.trim().replace(/^@/, "");
    if (!trimmedUsername) return;

    setErrorMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/ig/get-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, sessionId }),
      });

      if (res.status === 401 || res.status === 403) {
        setErrorMsg("Session Hatalı veya Sona Ermiş. Lütfen önce Session ID'nizi güncelleyin.");
        setLoading(false);
        return;
      }
      if (res.status === 404) {
        setErrorMsg("Hedef kullanıcı bulunamadı. Lütfen kullanıcı adını kontrol edin.");
        setLoading(false);
        return;
      }
      if (res.status === 429) {
        setErrorMsg("Instagram istek sınırına ulaşıldı. Lütfen bekleyip tekrar deneyin.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setErrorMsg(`Bilinmeyen bir hata oluştu (HTTP ${res.status}). Lütfen tekrar deneyin.`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.targetId) {
        onUpdate(trimmedUsername, data.targetId);
      } else {
        setErrorMsg("Hedef ID alınamadı (API hatası).");
        setLoading(false);
      }
    } catch {
      setErrorMsg("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.");
      setLoading(false);
    }
  };

  const canSubmit = newTarget.trim().length > 0 && !loading;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
    >
      <div className="anim-fade-up" style={{ background: "var(--color-surface)", borderRadius: 20, padding: "30px 28px", maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: "2.2rem" }}>🎯</span>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "10px 0 4px" }}>Hedef Hesabı Değiştir</h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.88rem", margin: 0, lineHeight: 1.5 }}>
            Tüm geçmiş verileriniz güvenliğiniz için sadece tarayıcınızda tutulmaktadır. <strong>Hedef hesap değiştiğinde önceki hesaba ait analiz verileri silinecektir.</strong>
          </p>
        </div>

        {errorMsg && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", fontSize: "0.84rem", marginBottom: 16 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label htmlFor={inputId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 8 }}>Yeni Kullanıcı Adı</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }}>@</span>
            <input
              id={inputId}
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value.replace(/\s/g, ""))}
              placeholder="kullaniciadi"
              autoComplete="off"
              autoFocus
              style={{ width: "100%", padding: "14px 16px 14px 32px", borderRadius: 12, border: "1.5px solid var(--color-border)", background: "var(--color-bg)", fontSize: "0.95rem", outline: "none" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ padding: "12px 22px", borderRadius: 12, border: "1.5px solid var(--color-border)", background: "transparent", fontSize: "0.88rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
            Vazgeç
          </button>
          <button type="button" className="btn-primary" disabled={!canSubmit} onClick={handleSubmit} style={{ padding: "12px 28px", opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}>
            {loading ? "Sorgulanıyor..." : "Onayla ve Değiştir"}
          </button>
        </div>
      </div>
    </div>
  );
}
