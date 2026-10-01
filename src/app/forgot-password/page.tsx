"use client";

import Link from "next/link";
import { useState, useCallback, useId } from "react";
import { useRouter } from "next/navigation";

type Step = "request-otp" | "verify-otp" | "reset-password";

async function apiPost<T>(
  url: string,
  body: Record<string, string>
): Promise<{ ok: boolean; data: T; status: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data, status: res.status };
}

// ─── Bildirim Banner'ı ────────────────────────────────────────────────────────
function AlertBanner({ type, message }: { type: "error" | "success"; message: string }) {
  const isSuccess = type === "success";
  return (
    <div
      role="alert"
      style={{
        padding: "12px 16px",
        borderRadius: "10px",
        background: isSuccess ? "#f0fdf4" : "#fff1f2",
        border: `1px solid ${isSuccess ? "#bbf7d0" : "#fecdd3"}`,
        color: isSuccess ? "#15803d" : "#be123c",
        fontSize: "0.875rem",
        fontWeight: 500,
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        lineHeight: 1.55,
      }}
    >
      <span style={{ flexShrink: 0 }}>{isSuccess ? "✅" : "❌"}</span>
      <span>{message}</span>
    </div>
  );
}

// ─── Ana Sayfa Bileşeni ────────────────────────────────────────────────────────
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request-otp");
  
  // State: Form verileri
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  
  // State: UI
  const [loading, setLoading] = useState(false);
  const [serverMsg, setServerMsg] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [showPass, setShowPass] = useState(false);

  // ID'ler
  const emailId = useId();
  const otpId = useId();
  const passId = useId();

  // 1. Adım: OTP İste
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setServerMsg({ text: "Geçerli bir e-posta adresi girin.", type: "error" });
      return;
    }
    
    setServerMsg(null);
    setLoading(true);
    try {
      const { ok, data } = await apiPost<{ message?: string; error?: string }>("/api/auth/forgot-password", { email });
      if (ok) {
        setServerMsg({ text: data.message || "Kod gönderildi.", type: "success" });
        setStep("verify-otp");
      } else {
        setServerMsg({ text: data.error || "İşlem başarısız.", type: "error" });
      }
    } catch {
      setServerMsg({ text: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // 2. Adım: OTP Doğrula
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 4) {
      setServerMsg({ text: "Lütfen 4 haneli kodu girin.", type: "error" });
      return;
    }

    setServerMsg(null);
    setLoading(true);
    try {
      const { ok, data } = await apiPost<{ message?: string; error?: string; resetToken?: string }>("/api/auth/verify-otp", { email, otp });
      if (ok && data.resetToken) {
        setResetToken(data.resetToken);
        setServerMsg({ text: data.message || "Kod doğrulandı.", type: "success" });
        setStep("reset-password");
      } else {
        setServerMsg({ text: data.error || "Geçersiz kod.", type: "error" });
      }
    } catch {
      setServerMsg({ text: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // 3. Adım: Şifre Sıfırla
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setServerMsg({ text: "Şifre en az 8 karakter olmalı.", type: "error" });
      return;
    }

    setServerMsg(null);
    setLoading(true);
    try {
      const { ok, data } = await apiPost<{ message?: string; error?: string }>("/api/auth/reset-password", { resetToken, newPassword });
      if (ok) {
        setServerMsg({ text: data.message || "Şifre güncellendi. Giriş yapabilirsiniz.", type: "success" });
        setTimeout(() => router.push("/login"), 3000);
      } else {
        setServerMsg({ text: data.error || "Şifre sıfırlanamadı.", type: "error" });
      }
    } catch {
      setServerMsg({ text: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", position: "relative", overflow: "hidden" }}>
        {/* Dekoratif bloblar */}
        <div style={{ position: "fixed", top: "-100px", left: "-100px", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, #fce7f3 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "fixed", bottom: "-100px", right: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, #fbcfe8 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />

        <div className="anim-fade-up" style={{ width: "100%", maxWidth: "440px", background: "var(--color-surface)", borderRadius: "24px", border: "1px solid var(--color-border)", boxShadow: "0 8px 48px -8px rgba(236,72,153,0.15), 0 2px 8px -2px rgba(0,0,0,0.06)", position: "relative", zIndex: 1, overflow: "hidden" }}>
          <div style={{ height: "4px", background: "linear-gradient(90deg, #ec4899, #f43f5e, #a855f7)" }} />
          <div style={{ padding: "36px 36px 40px" }}>
            
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
              <Link href="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "var(--color-text-primary)" }}>
                <span style={{ fontSize: "20px" }}>📸</span>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Follower <span className="gradient-text">Tracker</span></span>
              </Link>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                Şifremi Unuttum 🔐
              </h1>
              <p style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.6 }}>
                {step === "request-otp" && "Hesabınıza bağlı e-posta adresini girin, size bir sıfırlama kodu gönderelim."}
                {step === "verify-otp" && "E-postanıza gönderilen 4 haneli doğrulama kodunu girin."}
                {step === "reset-password" && "Yeni ve güvenli bir şifre belirleyin."}
              </p>
            </div>

            {serverMsg && <div style={{ marginBottom: "20px" }}><AlertBanner type={serverMsg.type} message={serverMsg.text} /></div>}

            {/* ADIM 1: OTP İSTE */}
            {step === "request-otp" && (
              <form onSubmit={handleRequestOtp} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label htmlFor={emailId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "8px" }}>E-posta Adresi</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none" }}>✉️</span>
                    <input id={emailId} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@gmail.com" required style={{ width: "100%", padding: "13px 16px 13px 44px", border: "1.5px solid var(--color-border)", borderRadius: "12px", fontSize: "0.95rem", outline: "none", transition: "border-color 0.2s" }} />
                  </div>
                </div>
                <SubmitButton loading={loading} label="Sıfırlama Kodu Gönder" />
              </form>
            )}

            {/* ADIM 2: OTP DOĞRULA */}
            {step === "verify-otp" && (
              <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label htmlFor={otpId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "8px" }}>Doğrulama Kodu</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none" }}>💬</span>
                    <input id={otpId} type="text" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0000" required style={{ width: "100%", padding: "13px 16px 13px 44px", border: "1.5px solid var(--color-border)", borderRadius: "12px", fontSize: "0.95rem", letterSpacing: "8px", fontWeight: "bold", outline: "none", transition: "border-color 0.2s" }} />
                  </div>
                </div>
                <SubmitButton loading={loading} label="Kodu Doğrula" />
              </form>
            )}

            {/* ADIM 3: YENİ ŞİFRE */}
            {step === "reset-password" && (
              <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label htmlFor={passId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "8px" }}>Yeni Şifre</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none" }}>🔑</span>
                    <input id={passId} type={showPass ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="En az 8 karakter" required style={{ width: "100%", padding: "13px 44px 13px 44px", border: "1.5px solid var(--color-border)", borderRadius: "12px", fontSize: "0.95rem", outline: "none", transition: "border-color 0.2s" }} />
                    <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "var(--color-text-muted)", padding: "4px" }}>
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>
                <SubmitButton loading={loading} label="Şifreyi Güncelle" />
              </form>
            )}

            <div style={{ marginTop: "24px", textAlign: "center" }}>
              <Link href="/login" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", textDecoration: "none", fontWeight: 500 }}>
                ← Giriş Ekranına Dön
              </Link>
            </div>
            
          </div>
        </div>
      </div>
    </>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string; }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="btn-primary"
      style={{
        width: "100%",
        padding: "15px",
        background: loading ? "#f9a8d4" : "linear-gradient(135deg, #ec4899, #f43f5e)",
        color: "#fff",
        fontWeight: 700,
        fontSize: "1rem",
        border: "none",
        borderRadius: "12px",
        cursor: loading ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
      }}
    >
      {loading ? (
        <><span style={{ display: "inline-block", width: "16px", height: "16px", border: "2.5px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> İşleniyor...</>
      ) : label}
    </button>
  );
}
