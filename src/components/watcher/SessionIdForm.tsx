"use client";

import { useId, useState } from "react";
import { saveWatcherInfo } from "@/lib/idb";

/**
 * Session ID giriş + doğrulama formu — TEK KAYNAK.
 *
 * Aynı mantık hem "Session ID Güncelle" modalında hem de Gözcü Hesap sayfasında
 * gerekiyordu. Kopyalamak yerine buraya çıkarıldı: doğrulama isteği, hata eşlemesi
 * (geçersiz / cooldown / rate limit) ve gözcü bilgisinin yerel kaydı tek yerde.
 *
 * Sunucu tarafında mevcut `/api/ig/verify-watcher` uç noktası kullanılır — yeni
 * endpoint yazılmadı.
 */
export default function SessionIdForm({
  onVerified,
  onCancel,
  submitLabel = "Güncelle",
  busyLabel = "Doğrulanıyor...",
  autoFocus = false,
  label = "Yeni Session ID",
}: {
  /** Doğrulama başarılı olduğunda çağrılır. */
  onVerified: (sessionId: string, username: string) => void | Promise<void>;
  /** Verilirse "Vazgeç" butonu görünür (modal kullanımı için). */
  onCancel?: () => void;
  submitLabel?: string;
  busyLabel?: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setErrorMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/ig/verify-watcher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ sessionId: trimmed }),
      });

      if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || "Bu Session ID geçersiz. Lütfen güncel bir Session ID girin.");
        setLoading(false);
        return;
      }

      if (res.status === 429) {
        setErrorMsg("Instagram istek sınırına ulaşıldı. Birkaç dakika bekleyip tekrar deneyin.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setErrorMsg(`Doğrulama başarısız (HTTP ${res.status}). Tekrar deneyin.`);
        setLoading(false);
        return;
      }

      const data = await res.json();

      // Gözcü bilgisini yerel olarak sakla — Gözcü Hesap sayfası bunu istek atmadan okur
      if (data.username) {
        await saveWatcherInfo({ username: data.username, verifiedAt: new Date().toISOString() });
      }

      await onVerified(trimmed, data.username);
      setValue("");
    } catch {
      setErrorMsg("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = value.trim().length > 0 && !loading;

  return (
    <>
      {errorMsg && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            color: "#c2410c",
            fontSize: "0.84rem",
            marginBottom: 16,
          }}
        >
          ⚠️ {errorMsg}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <label
          htmlFor={inputId}
          style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 8 }}
        >
          {label}
        </label>
        <input
          id={inputId}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) handleSubmit();
          }}
          placeholder="••••••••••••••••••••••••"
          autoComplete="off"
          autoFocus={autoFocus}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 12,
            border: "1.5px solid var(--color-border)",
            background: "var(--color-bg)",
            fontSize: "0.95rem",
            outline: "none",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "12px 22px",
              borderRadius: 12,
              border: "1.5px solid var(--color-border)",
              background: "transparent",
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            Vazgeç
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
          style={{
            padding: "12px 28px",
            opacity: canSubmit ? 1 : 0.45,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {loading ? busyLabel : submitLabel}
        </button>
      </div>
    </>
  );
}
