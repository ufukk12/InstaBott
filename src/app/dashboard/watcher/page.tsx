"use client";

import { useCallback, useEffect, useState } from "react";
import SessionIdForm from "@/components/watcher/SessionIdForm";
import { getAuthData, getWatcherInfo, saveAuthData, type WatcherInfo } from "@/lib/idb";

/**
 * Gözcü Hesap sayfası.
 *
 * TASARIM KARARI — sayfa açılışında Instagram'a İSTEK ATILMAZ:
 * Gözcü hesabın kullanıcı adı, Session ID doğrulandığı anda yerel olarak kaydedilir
 * (bkz. SessionIdForm → saveWatcherInfo). Bu sayfa onu anında okur. Canlı "aktiflik
 * durumu" sorgusu ise kullanıcı tetiklidir — her sayfa ziyaretinde otomatik istek atmak,
 * rate-limit bütçesini sessizce tüketirdi.
 *
 * Mevcut `/api/analysis/check-watcher` uç noktası yeniden kullanılır; yeni endpoint yok.
 */

type LiveStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "active"; username: string }
  | { kind: "cooldown"; username: string; until: string }
  | { kind: "invalid" }
  | { kind: "ratelimit" }
  | { kind: "error"; message: string };

export default function WatcherPage() {
  const [watcher, setWatcher] = useState<WatcherInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [targetUsername, setTargetUsername] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LiveStatus>({ kind: "idle" });
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    const [info, auth] = await Promise.all([getWatcherInfo(), getAuthData()]);
    setWatcher(info);
    setSessionId(auth?.sessionId ?? null);
    setTargetUsername(auth?.targetUsername ?? "");
    setTargetId(auth?.targetId ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  const checkStatus = useCallback(async () => {
    if (!sessionId) return;
    setStatus({ kind: "loading" });

    try {
      const res = await fetch("/api/analysis/check-watcher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      if (res.status === 429) {
        setStatus({ kind: "ratelimit" });
        return;
      }
      if (!res.ok) {
        setStatus({ kind: "error", message: `Durum alınamadı (HTTP ${res.status})` });
        return;
      }

      const data = await res.json();

      if (data.sessionValid === false) {
        setStatus({ kind: "invalid" });
        return;
      }
      if (data.cooldownActive) {
        setStatus({ kind: "cooldown", username: data.username ?? "—", until: data.cooldownUntil });
        return;
      }
      setStatus({ kind: "active", username: data.username ?? "—" });
    } catch {
      setStatus({ kind: "error", message: "Sunucuya bağlanılamadı." });
    }
  }, [sessionId]);

  // Session ID güncellendiğinde: yeni oturumu kaydet, yerel bilgiyi tazele
  const handleVerified = useCallback(
    async (newSessionId: string, username: string) => {
      await saveAuthData(newSessionId, targetUsername, targetId);
      setSessionId(newSessionId);
      setSavedMessage(`Gözcü hesap güncellendi: @${username}`);
      setStatus({ kind: "idle" });
      await loadLocal();
    },
    [targetUsername, targetId, loadLocal]
  );

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "36px 32px", maxWidth: 760 }}>
        <div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>Gözcü Hesap</h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", margin: "6px 0 0", lineHeight: 1.6 }}>
            Analizler, sizin adınıza Instagram&apos;a bağlanan bu &quot;gözcü&quot; hesabın oturumu üzerinden yürütülür.
            Hedef hesap (<strong>@{targetUsername || "—"}</strong>) ile karıştırmayın.
          </p>
        </div>

        {/* ─── Hesap Kartı ──────────────────────────────────────────────── */}
        <div className="feature-card" style={{ padding: "24px 26px" }}>
          <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.5px" }}>
            AKTİF GÖZCÜ HESAP
          </p>

          {loading ? (
            <p style={{ margin: "10px 0 0", color: "var(--color-text-muted)" }}>Yükleniyor...</p>
          ) : watcher ? (
            <>
              <p style={{ margin: "8px 0 0", fontSize: "1.25rem", fontWeight: 800 }}>@{watcher.username}</p>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                Son doğrulama: {new Date(watcher.verifiedAt).toLocaleString("tr-TR")}
              </p>
            </>
          ) : (
            <p style={{ margin: "8px 0 0", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Henüz doğrulanmış bir gözcü hesap kaydı yok. Aşağıdan Session ID girerek tanımlayabilirsiniz.
            </p>
          )}

          {/* ─── Aktiflik Durumu ──────────────────────────────────────── */}
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700 }}>Aktiflik Durumu</p>
              <button
                type="button"
                onClick={checkStatus}
                disabled={!sessionId || status.kind === "loading"}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: "1.5px solid var(--color-border)",
                  background: "var(--color-surface)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: !sessionId || status.kind === "loading" ? "not-allowed" : "pointer",
                  opacity: !sessionId || status.kind === "loading" ? 0.5 : 1,
                }}
              >
                {status.kind === "loading" ? "Kontrol ediliyor..." : "Durumu Kontrol Et"}
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {status.kind === "idle" && (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  Canlı durum, Instagram&apos;a bir istek gerektirir. Gereksiz istek atmamak için
                  otomatik sorgulanmaz — kontrol etmek için butona basın.
                </p>
              )}
              {status.kind === "active" && (
                <StatusPill color="#047857" bg="#ecfdf5" border="#a7f3d0">
                  ● Aktif — @{status.username} kullanıma hazır
                </StatusPill>
              )}
              {status.kind === "cooldown" && (
                <StatusPill color="#b45309" bg="#fffbeb" border="#fcd34d">
                  ● Nadasta — @{status.username} güvenlik için dinlendiriliyor
                  {status.until ? ` (${new Date(status.until).toLocaleString("tr-TR")}'e kadar)` : ""}
                </StatusPill>
              )}
              {status.kind === "invalid" && (
                <StatusPill color="#b91c1c" bg="#fef2f2" border="#fecaca">
                  ● Oturum geçersiz — aşağıdan yeni bir Session ID girin
                </StatusPill>
              )}
              {status.kind === "ratelimit" && (
                <StatusPill color="#b45309" bg="#fffbeb" border="#fcd34d">
                  ● Instagram istek sınırı — birkaç dakika sonra tekrar deneyin
                </StatusPill>
              )}
              {status.kind === "error" && (
                <StatusPill color="#b91c1c" bg="#fef2f2" border="#fecaca">
                  ● {status.message}
                </StatusPill>
              )}
            </div>
          </div>
        </div>

        {/* ─── Session ID Güncelleme ────────────────────────────────────── */}
        <div className="feature-card" style={{ padding: "24px 26px" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 6px" }}>Session ID Güncelle</h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", margin: "0 0 18px", lineHeight: 1.6 }}>
            Gözcü hesabın oturumu sona erdiğinde veya farklı bir gözcü hesaba geçmek istediğinizde
            buradan güncelleyin. Girilen değer Instagram&apos;a doğrulatılır, geçerliyse kaydedilir.
          </p>

          {savedMessage && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#047857",
                fontSize: "0.85rem",
                marginBottom: 16,
                fontWeight: 600,
              }}
            >
              ✓ {savedMessage}
            </div>
          )}

          <SessionIdForm onVerified={handleVerified} submitLabel="Doğrula ve Kaydet" />
        </div>
      </div>
    </>
  );
}

function StatusPill({
  children,
  color,
  bg,
  border,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div
      style={{
        display: "inline-block",
        padding: "10px 16px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: "0.86rem",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}
