"use client";

import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Doğrulanıyor...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Geçersiz veya eksik doğrulama bağlantısı.");
      return;
    }

    // API'ye GET isteği atarak token'ı doğrula
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "E-postanız başarıyla doğrulandı.");
        } else {
          setStatus("error");
          setMessage(data.error || "Doğrulama başarısız oldu.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Sunucuyla iletişim kurulurken bir hata oluştu.");
      });
  }, [token]);

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>
        {status === "loading" && "⏳"}
        {status === "success" && "✅"}
        {status === "error" && "❌"}
      </div>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "8px" }}>
        {status === "loading" && "E-posta Doğrulanıyor"}
        {status === "success" && "Hesap Doğrulandı!"}
        {status === "error" && "Doğrulama Hatası"}
      </h2>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem", marginBottom: "32px" }}>
        {message}
      </p>

      {status !== "loading" && (
        <Link
          href="/login"
          className="btn-primary"
          style={{ width: "100%", padding: "14px", borderRadius: "12px", display: "inline-block" }}
        >
          Giriş Yap
        </Link>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", position: "relative", overflow: "hidden" }}>
      {/* Dekoratif bloblar */}
      <div style={{ position: "fixed", top: "-100px", left: "-100px", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, #fce7f3 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "-100px", right: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, #fbcfe8 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />

      <div className="anim-fade-up" style={{ width: "100%", maxWidth: "400px", background: "var(--color-surface)", borderRadius: "24px", border: "1px solid var(--color-border)", boxShadow: "0 8px 48px -8px rgba(236,72,153,0.15), 0 2px 8px -2px rgba(0,0,0,0.06)", position: "relative", zIndex: 1, overflow: "hidden" }}>
        <div style={{ height: "4px", background: "linear-gradient(90deg, #ec4899, #f43f5e, #a855f7)" }} />
        
        <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>Yükleniyor...</div>}>
          <VerifyEmailContent />
        </Suspense>
        
      </div>
    </div>
  );
}
