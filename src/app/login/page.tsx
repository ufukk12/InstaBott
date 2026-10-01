"use client";

import Link from "next/link";
import { useState, useCallback, useId } from "react";
import { useRouter } from "next/navigation";

// ─── Tip Tanımları ───────────────────────────────────────────────────────────
type Tab = "login" | "register";
type FieldError = { email?: string; password?: string; confirm?: string };

// ─── Küçük yardımcı: API isteği gönder ──────────────────────────────────────
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

// ─── İstemci-taraflı doğrulama ───────────────────────────────────────────────
function validateLogin(email: string, password: string): FieldError {
  const err: FieldError = {};
  if (!email.trim()) err.email = "E-posta adresi gerekli";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    err.email = "Geçerli bir e-posta girin";
  if (!password) err.password = "Şifre gerekli";
  return err;
}

function validateRegister(
  email: string,
  password: string,
  confirm: string
): FieldError {
  const err: FieldError = {};
  if (!email.trim()) err.email = "E-posta adresi gerekli";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    err.email = "Geçerli bir e-posta girin";
  if (!password) err.password = "Şifre gerekli";
  else if (password.length < 8) err.password = "Şifre en az 8 karakter olmalı";
  if (!confirm) err.confirm = "Şifreyi tekrar girin";
  else if (confirm !== password) err.confirm = "Şifreler eşleşmiyor";
  return err;
}

// ─── Giriş Formu ─────────────────────────────────────────────────────────────
function LoginForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [serverMsg, setServerMsg] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setServerMsg(null);

      // İstemci doğrulaması
      const fieldErrors = validateLogin(email, password);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return;
      }
      setErrors({});
      setLoading(true);

      try {
        const { ok, data } = await apiPost<{ error?: string; message?: string; token?: string }>(
          "/api/auth/login",
          { email: email.trim().toLowerCase(), password }
        );

        if (ok && data.token) {
          // JWT'yi localStorage'da sakla — onboarding/dashboard'da kullanılacak
          localStorage.setItem("auth_token", data.token);
          setServerMsg({ text: "Giriş başarılı! Yönlendiriliyorsunuz…", type: "success" });
          
          // Eğer admin girişi ise doğrudan admin paneline yönlendir
          if (email.trim().toLowerCase() === "kadri3749@gmail.com") {
            setTimeout(() => {
              router.push("/admin/dashboard");
            }, 800);
            return;
          }

          // Var olan kullanıcı mı kontrol et: IndexedDB'de auth verisi varsa → /dashboard
          setTimeout(async () => {
            try {
              const { getAuthData } = await import("@/lib/idb");
              const existing = await getAuthData();
              if (existing?.sessionId && existing?.targetId) {
                router.push("/dashboard");
              } else {
                router.push("/onboarding");
              }
            } catch {
              router.push("/onboarding");
            }
          }, 800);
        } else {
          setServerMsg({
            text: (data as any).error ?? "Giriş yapılamadı. Lütfen tekrar deneyin.",
            type: "error",
          });
        }
      } catch {
        setServerMsg({ text: "Bağlantı hatası. İnternet bağlantınızı kontrol edin.", type: "error" });
      } finally {
        setLoading(false);
      }
    },
    [email, password, router]
  );

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Sunucu mesajı */}
      {serverMsg && (
        <AlertBanner type={serverMsg.type} message={serverMsg.text} />
      )}

      {/* E-posta */}
      <FormField
        id={emailId}
        label="E-posta Adresi"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="ornek@gmail.com"
        error={errors.email}
        autoComplete="email"
        icon="✉️"
      />

      {/* Şifre */}
      <div style={{ position: "relative" }}>
        <FormField
          id={passwordId}
          label="Şifre"
          type={showPass ? "text" : "password"}
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          error={errors.password}
          autoComplete="current-password"
          icon="🔑"
          paddingRight="52px"
        />
        {/* Şifreyi göster/gizle butonu */}
        <button
          type="button"
          onClick={() => setShowPass((v) => !v)}
          aria-label={showPass ? "Şifreyi gizle" : "Şifreyi göster"}
          style={{
            position: "absolute",
            right: "14px",
            // Hata varsa label+input+error yüksekliği hesapla; yaklaşık
            top: errors.password ? "38px" : "38px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            color: "var(--color-text-muted)",
            padding: "4px",
            lineHeight: 1,
          }}
        >
          {showPass ? "🙈" : "👁️"}
        </button>
      </div>

      {/* Şifremi Unuttum */}
      <div style={{ textAlign: "right", marginTop: "-12px" }}>
        <Link
          href="/forgot-password"
          id="forgot-password-link"
          style={{
            fontSize: "0.83rem",
            color: "#ec4899",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Şifremi Unuttum →
        </Link>
      </div>

      {/* Gönder */}
      <SubmitButton loading={loading} label="Giriş Yap" loadingLabel="Giriş yapılıyor…" />
    </form>
  );
}

// ─── Kayıt Formu ─────────────────────────────────────────────────────────────
function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  const [serverMsg, setServerMsg] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setServerMsg(null);

      const fieldErrors = validateRegister(email, password, confirm);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return;
      }
      setErrors({});
      setLoading(true);

      try {
        const { ok, data } = await apiPost<{ error?: string; message?: string }>(
          "/api/auth/register",
          { email: email.trim().toLowerCase(), password }
        );

        if (ok) {
          setServerMsg({
            text: data.message ?? "Kayıt başarılı! Lütfen e-postanızı doğrulayın.",
            type: "success",
          });
          // Başarılı kayıt → Login tabına geç (2 sn sonra)
          setTimeout(() => onSuccess(), 2500);
        } else {
          setServerMsg({
            text: data.error ?? "Kayıt sırasında bir hata oluştu.",
            type: "error",
          });
        }
      } catch {
        setServerMsg({ text: "Bağlantı hatası. İnternet bağlantınızı kontrol edin.", type: "error" });
      } finally {
        setLoading(false);
      }
    },
    [email, password, confirm, onSuccess]
  );

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {serverMsg && <AlertBanner type={serverMsg.type} message={serverMsg.text} />}

      <FormField
        id={emailId}
        label="E-posta Adresi"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="ornek@gmail.com"
        error={errors.email}
        autoComplete="email"
        icon="✉️"
      />

      <div style={{ position: "relative" }}>
        <FormField
          id={passwordId}
          label="Şifre"
          type={showPass ? "text" : "password"}
          value={password}
          onChange={setPassword}
          placeholder="En az 8 karakter"
          error={errors.password}
          autoComplete="new-password"
          icon="🔑"
          paddingRight="52px"
        />
        <button
          type="button"
          onClick={() => setShowPass((v) => !v)}
          aria-label={showPass ? "Şifreyi gizle" : "Şifreyi göster"}
          style={{
            position: "absolute",
            right: "14px",
            top: "38px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            color: "var(--color-text-muted)",
            padding: "4px",
          }}
        >
          {showPass ? "🙈" : "👁️"}
        </button>
      </div>

      {/* Şifre güç göstergesi */}
      <PasswordStrength password={password} />

      <FormField
        id={confirmId}
        label="Şifre Tekrar"
        type={showPass ? "text" : "password"}
        value={confirm}
        onChange={setConfirm}
        placeholder="Şifrenizi tekrar girin"
        error={errors.confirm}
        autoComplete="new-password"
        icon="🔒"
      />

      <SubmitButton loading={loading} label="Hesap Oluştur" loadingLabel="Hesap oluşturuluyor…" />
    </form>
  );
}

// ─── Şifre Güç Göstergesi ────────────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ["Çok Zayıf", "Zayıf", "Orta", "Güçlü", "Çok Güçlü"];
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];

  return (
    <div style={{ marginTop: "-12px" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "6px" }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "4px",
              backgroundColor: i < score ? colors[score] : "#e5e7eb",
              transition: "background-color 0.3s ease",
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: "0.75rem", color: colors[score], fontWeight: 500 }}>
        {labels[score]}
      </span>
    </div>
  );
}

// ─── Yeniden kullanılabilir Form Alanı ───────────────────────────────────────
interface FormFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  autoComplete?: string;
  icon: string;
  paddingRight?: string;
}

function FormField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  autoComplete,
  icon,
  paddingRight = "16px",
}: FormFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          marginBottom: "8px",
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        {/* Sol ikon */}
        <span
          style={{
            position: "absolute",
            left: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "15px",
            pointerEvents: "none",
          }}
        >
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            padding: `13px ${paddingRight} 13px 44px`,
            border: `1.5px solid ${
              error ? "#ef4444" : focused ? "#ec4899" : "var(--color-border)"
            }`,
            borderRadius: "12px",
            fontSize: "0.95rem",
            background: focused ? "#fff" : "#fafafa",
            color: "var(--color-text-primary)",
            outline: "none",
            transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
            boxSizing: "border-box",
            boxShadow: focused
              ? "0 0 0 3px rgba(236,72,153,0.12)"
              : error
              ? "0 0 0 3px rgba(239,68,68,0.10)"
              : "none",
          }}
        />
      </div>
      {/* Hata mesajı */}
      {error && (
        <p
          role="alert"
          style={{
            marginTop: "6px",
            fontSize: "0.8rem",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}

// ─── Gönder Butonu ────────────────────────────────────────────────────────────
function SubmitButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      id="auth-submit-btn"
      style={{
        width: "100%",
        padding: "15px",
        background: loading
          ? "#f9a8d4"
          : "linear-gradient(135deg, #ec4899, #f43f5e)",
        color: "#fff",
        fontWeight: 700,
        fontSize: "1rem",
        border: "none",
        borderRadius: "12px",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: loading ? "none" : "0 4px 20px rgba(236,72,153,0.35)",
        transition: "transform 0.2s, box-shadow 0.2s, background 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 28px rgba(236,72,153,0.50)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(236,72,153,0.35)";
      }}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: "16px",
        height: "16px",
        border: "2.5px solid rgba(255,255,255,0.4)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

// ─── Bildirim Banner'ı ────────────────────────────────────────────────────────
function AlertBanner({
  type,
  message,
}: {
  type: "error" | "success";
  message: string;
}) {
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

// ─── Ana Login Sayfası ────────────────────────────────────────────────────────
export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<Tab>("login");

  // Kayıt başarısı → Login tabına geç
  const handleRegisterSuccess = useCallback(() => {
    setActiveTab("login");
  }, []);

  return (
    <>
      {/* Spinner keyframe — global style ekleme */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "var(--color-bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Arka plan blob'lar */}
        <div
          style={{
            position: "fixed",
            top: "-100px",
            left: "-100px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, #fce7f3 0%, transparent 70%)",
            filter: "blur(80px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: "fixed",
            bottom: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, #fbcfe8 0%, transparent 70%)",
            filter: "blur(80px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Kart konteyner */}
        <div
          className="anim-fade-up"
          style={{
            width: "100%",
            maxWidth: "440px",
            background: "var(--color-surface)",
            borderRadius: "24px",
            border: "1px solid var(--color-border)",
            boxShadow:
              "0 8px 48px -8px rgba(236,72,153,0.15), 0 2px 8px -2px rgba(0,0,0,0.06)",
            position: "relative",
            zIndex: 1,
            overflow: "hidden",
          }}
        >
          {/* Üst pembe şerit */}
          <div
            style={{
              height: "4px",
              background: "linear-gradient(90deg, #ec4899, #f43f5e, #a855f7)",
            }}
          />

          <div style={{ padding: "36px 36px 40px" }}>
            {/* Logo + geri link */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "28px",
              }}
            >
              <Link
                href="/"
                id="back-to-home-link"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  textDecoration: "none",
                  color: "var(--color-text-primary)",
                }}
              >
                <span style={{ fontSize: "20px" }}>📸</span>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  Follower{" "}
                  <span className="gradient-text">Tracker</span>
                </span>
              </Link>
              <Link
                href="/"
                style={{
                  fontSize: "0.8rem",
                  color: "var(--color-text-muted)",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                ← Ana Sayfa
              </Link>
            </div>

            {/* Tab seçici */}
            <div
              role="tablist"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "4px",
                padding: "4px",
                background: "#f9f0f5",
                borderRadius: "12px",
                marginBottom: "28px",
              }}
            >
              {(["login", "register"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  id={`tab-${tab}`}
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "10px",
                    borderRadius: "9px",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                    transition: "all 0.22s ease",
                    background:
                      activeTab === tab
                        ? "#fff"
                        : "transparent",
                    color:
                      activeTab === tab
                        ? "#ec4899"
                        : "var(--color-text-secondary)",
                    boxShadow:
                      activeTab === tab
                        ? "0 1px 6px rgba(0,0,0,0.08)"
                        : "none",
                  }}
                >
                  {tab === "login" ? "Giriş Yap" : "Kayıt Ol"}
                </button>
              ))}
            </div>

            {/* Başlık */}
            <div style={{ marginBottom: "24px" }}>
              <h1
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "var(--color-text-primary)",
                  margin: "0 0 6px",
                  letterSpacing: "-0.02em",
                }}
              >
                {activeTab === "login" ? "Hoş Geldiniz! 👋" : "Hesap Oluşturun ✨"}
              </h1>
              <p
                style={{
                  fontSize: "0.88rem",
                  color: "var(--color-text-secondary)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {activeTab === "login"
                  ? "Hesabınıza giriş yaparak analize devam edin."
                  : "Dakikalar içinde ücretsiz hesabınızı oluşturun."}
              </p>
            </div>

            {/* Form — tab geçişi */}
            <div
              key={activeTab}
              className="anim-fade-up"
            >
              {activeTab === "login" ? (
                <LoginForm />
              ) : (
                <RegisterForm onSuccess={handleRegisterSuccess} />
              )}
            </div>

            {/* Ayıraç */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                margin: "24px 0",
              }}
            >
              <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                {activeTab === "login" ? "Hesabınız yok mu?" : "Zaten üye misiniz?"}
              </span>
              <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
            </div>

            {/* Tab değiştirme linki */}
            <button
              type="button"
              id={`switch-to-${activeTab === "login" ? "register" : "login"}`}
              onClick={() =>
                setActiveTab(activeTab === "login" ? "register" : "login")
              }
              style={{
                width: "100%",
                padding: "13px",
                background: "transparent",
                border: "1.5px solid var(--color-border)",
                borderRadius: "12px",
                color: "#ec4899",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
                transition: "border-color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#ec4899";
                (e.currentTarget as HTMLButtonElement).style.background = "#fdf8f6";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              {activeTab === "login" ? "Ücretsiz Hesap Oluştur →" : "← Giriş Yap"}
            </button>
          </div>
        </div>

        {/* Alt güven notu */}
        <p
          className="anim-fade-up anim-delay-2"
          style={{
            marginTop: "20px",
            fontSize: "0.78rem",
            color: "var(--color-text-muted)",
            textAlign: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          🔒 SSL ile korunmaktadır · Ana Instagram şifreniz asla istenmez
        </p>
      </div>
    </>
  );
}
