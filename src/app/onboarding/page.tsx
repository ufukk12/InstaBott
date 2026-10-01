"use client";

import { useState, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { clientLogger, clientErrorMeta } from "@/lib/clientLogger";

// ─── Tip Tanımları ───────────────────────────────────────────────────────────
type StepNumber = 1 | 2 | 3;

interface OnboardingState {
  step1Confirmed: boolean; // "Okudum, anladım ve gözcü hesabımı hazırladım"
  sessionId: string;
  keepAlive: boolean; // "Oturumu Canlı Tut (Otomatik Ping)"
  targetUsername: string;
}

const STEP_LABELS = ["Fake Hesap", "Session ID", "Hedef Hesap"] as const;

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [step, setStep] = useState<StepNumber>(1);
  const [state, setState] = useState<OnboardingState>({
    step1Confirmed: false,
    sessionId: "",
    keepAlive: false,
    targetUsername: "",
  });

  const goNext = useCallback(() => {
    setStep((s) => (s < 3 ? ((s + 1) as StepNumber) : s));
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => (s > 1 ? ((s - 1) as StepNumber) : s));
  }, []);

  // Step 3 tamamlandığında dashboard'a yönlendir
  const handleOnboardingComplete = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        padding: "48px 24px 80px",
      }}
    >
      <div className="container-xl" style={{ maxWidth: 720 }}>
        {/* Başlık */}
        <div className="anim-fade-up" style={{ textAlign: "center", marginBottom: 36 }}>
          <h1 className="gradient-text" style={{ fontSize: "1.85rem", fontWeight: 800, margin: 0 }}>
            İlk Kurulum
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginTop: 8, fontSize: "0.95rem" }}>
            Hesabını analize hazır hale getirmek için 3 kısa adım
          </p>
        </div>

        {/* Adım göstergesi */}
        <StepIndicator current={step} />

        {/* Adım içerikleri */}
        <div
          className="feature-card anim-fade-up"
          style={{ marginTop: 28, padding: "36px 32px", overflow: "visible" }}
        >
          {step === 1 && (
            <Step1FakeAccount
              confirmed={state.step1Confirmed}
              onConfirmedChange={(v) => setState((s) => ({ ...s, step1Confirmed: v }))}
              onNext={goNext}
            />
          )}
          {step === 2 && (
            <Step2SessionId
              sessionId={state.sessionId}
              keepAlive={state.keepAlive}
              email={user?.email || ""}
              onSessionIdChange={(v) => setState((s) => ({ ...s, sessionId: v }))}
              onKeepAliveChange={(v) => setState((s) => ({ ...s, keepAlive: v }))}
              onBack={goBack}
              onNext={goNext}
              onComplete={handleOnboardingComplete}
            />
          )}
          {step === 3 && (
            <Step3TargetAccount
              targetUsername={state.targetUsername}
              sessionId={state.sessionId}
              onTargetUsernameChange={(v) => setState((s) => ({ ...s, targetUsername: v }))}
              onBack={goBack}
              onComplete={handleOnboardingComplete}
            />
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Adım Göstergesi (Stepper) ────────────────────────────────────────────────
function StepIndicator({ current }: { current: StepNumber }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
      {STEP_LABELS.map((label, i) => {
        const num = (i + 1) as StepNumber;
        const isActive = num === current;
        const isDone = num < current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  transition: "all 0.25s ease",
                  background: isDone
                    ? "linear-gradient(135deg, #ec4899, #f43f5e)"
                    : isActive
                    ? "var(--color-surface)"
                    : "var(--color-pink-1)",
                  color: isDone ? "#fff" : isActive ? "var(--color-pink-4)" : "var(--color-text-muted)",
                  border: isActive ? "2px solid var(--color-pink-4)" : "2px solid transparent",
                  boxShadow: isDone ? "var(--shadow-btn)" : "none",
                }}
              >
                {isDone ? "✓" : num}
              </div>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--color-pink-5)" : "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </div>
            {num < 3 && (
              <div
                style={{
                  width: 44,
                  height: 2,
                  margin: "0 4px 18px",
                  background: isDone ? "var(--color-pink-4)" : "var(--color-border)",
                  transition: "background 0.25s ease",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Adım 1: Fake Hesap Bildirimi ─────────────────────────────────────────────
function Step1FakeAccount({
  confirmed,
  onConfirmedChange,
  onNext,
}: {
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
  onNext: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <span style={{ fontSize: "2rem" }}>🕵️‍♀️</span>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "10px 0 4px" }}>
          Gözcü (Fake) Hesap Gerekiyor
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.92rem", lineHeight: 1.6 }}>
          Analiz için ana Instagram hesabını değil, ayrı bir &quot;gözcü&quot; hesabını kullanıyoruz.
        </p>
      </div>

      {/* Güven vurgusu */}
      <InfoBanner tone="success" icon="🔒" title="Ana hesabınızın şifresini ASLA istemiyoruz.">
        Sizden yalnızca gözcü hesabınızın oturum bilgisini alıyoruz. Ana hesabınızın şifresi
        hiçbir zaman bizimle paylaşılmaz.
      </InfoBanner>

      {/* Kritik uyarı */}
      <InfoBanner tone="warning" icon="⚠️" title="Kritik Uyarı">
        Bu fake hesap, analizi yapılacak <strong>ana hesabınızı mutlaka takip etmelidir!</strong>{" "}
        Aksi halde analiz sonuçları eksik veya hatalı olur.
      </InfoBanner>

      {/* Onay checkbox */}
      <CheckboxRow
        checked={confirmed}
        onChange={onConfirmedChange}
        label="Okudum, anladım ve gözcü hesabımı hazırladım"
      />

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <button
          type="button"
          className="btn-primary"
          disabled={!confirmed}
          onClick={onNext}
          style={{
            opacity: confirmed ? 1 : 0.45,
            cursor: confirmed ? "pointer" : "not-allowed",
            padding: "14px 36px",
          }}
        >
          İleri →
        </button>
      </div>
    </div>
  );
}

// ─── Adım 2: Session ID Girişi ────────────────────────────────────────────────
function Step2SessionId({
  sessionId,
  keepAlive,
  email,
  onSessionIdChange,
  onKeepAliveChange,
  onBack,
  onNext,
  onComplete,
}: {
  sessionId: string;
  keepAlive: boolean;
  email: string;
  onSessionIdChange: (v: string) => void;
  onKeepAliveChange: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
  onComplete: () => void;
}) {
  const sessionInputId = useId();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleNext = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      const trimmedSessionId = sessionId.trim();

      const res = await fetch("/api/ig/verify-session", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ sessionId: trimmedSessionId }),
      });

      if (res.status === 401 || res.status === 403) {
        setErrorMsg("Session Hatalı veya Sona Ermiş. Lütfen geçerli bir Session ID güncelleyin.");
        setLoading(false);
        return;
      }

      if (res.status === 429) {
        setErrorMsg("Instagram istek sınırına ulaşıldı. Birkaç dakika bekleyip tekrar deneyin.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setErrorMsg(`Bilinmeyen bir hata oluştu (HTTP ${res.status}). Lütfen tekrar deneyin.`);
        setLoading(false);
        return;
      }

      // Başarılı olursa, localStorage'da eski hedef hesap var mı kontrol et (Stage 2)
      if (email) {
        const savedTargetStr = localStorage.getItem(`lastTarget_${email}`);
        if (savedTargetStr) {
          try {
            const parsed = JSON.parse(savedTargetStr);
            if (parsed.targetUsername && parsed.targetId) {
              const { saveAuthData } = await import("@/lib/idb");
              await saveAuthData(trimmedSessionId, parsed.targetUsername, parsed.targetId);
              onComplete();
              return;
            }
          } catch (e) {
            clientLogger.warn("onboarding", "localStorage ayrıştırılamadı", clientErrorMeta(e));
          }
        }
      }

      onNext();
    } catch (err) {
      setErrorMsg("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.");
      setLoading(false);
    }
  };

  // Switch'e tıklanınca: kapatmak her zaman serbest, açmak için modal onayı şart
  const handleSwitchToggle = useCallback(
    (next: boolean) => {
      if (next) {
        setModalOpen(true);
      } else {
        onKeepAliveChange(false);
      }
    },
    [onKeepAliveChange]
  );

  const handleModalAccept = useCallback(() => {
    onKeepAliveChange(true);
    setModalOpen(false);
  }, [onKeepAliveChange]);

  const handleModalCancel = useCallback(() => {
    // Reddedilirse switch açılmadan kapalı kalır
    setModalOpen(false);
  }, []);

  const canProceed = sessionId.trim().length > 0 && !loading;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <span style={{ fontSize: "2rem" }}>🔑</span>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "10px 0 4px" }}>
          Session ID Girişi
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.92rem", lineHeight: 1.6 }}>
          Gözcü hesabınızın oturum kimliğini (sessionid) aşağıya girin.
        </p>
      </div>

      {errorMsg && (
        <InfoBanner tone="warning" icon="⚠️">
          {errorMsg}
        </InfoBanner>
      )}

      {/* Session ID input */}
      <div>
        <label
          htmlFor={sessionInputId}
          style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 8 }}
        >
          Session ID
        </label>
        <input
          id={sessionInputId}
          type="password"
          value={sessionId}
          onChange={(e) => onSessionIdChange(e.target.value)}
          placeholder="••••••••••••••••••••••••"
          autoComplete="off"
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 12,
            border: "1.5px solid var(--color-border)",
            background: "var(--color-surface)",
            fontSize: "0.95rem",
            outline: "none",
          }}
        />
      </div>

      {/* Switch: Oturumu Canlı Tut */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 18px",
          borderRadius: 14,
          background: "var(--color-pink-1)",
          border: "1px solid var(--color-pink-2)",
        }}
      >
        <div style={{ paddingRight: 16 }}>
          <p style={{ fontWeight: 600, fontSize: "0.9rem", margin: 0 }}>
            Oturumu Canlı Tut (Otomatik Ping)
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", margin: "4px 0 0" }}>
            Session&apos;ın düşmemesi için periyodik olarak otomatik kontrol yapılır.
          </p>
        </div>
        <SwitchToggle checked={keepAlive} onChange={handleSwitchToggle} />
      </div>

      {/* Bilgi kartları */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
        <ExpandableInfoCard icon="❓" title="Session ID Nasıl Alınır?">
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
            <p style={{ margin: 0 }}>Öncelikle tarayıcınızdan <strong>instagram.com</strong>&apos;a girip gözcü (fake) hesabınıza giriş yapın.</p>
            
            <div>
              <strong style={{ color: "var(--color-text-primary)" }}>💻 Windows / Linux / Mac (Chrome, Edge, vb.):</strong>
              <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                <li>Sayfada herhangi bir yere sağ tıklayıp <strong>&quot;İncele&quot;</strong> (Inspect) seçeneğine tıklayın.</li>
                <li>Açılan yan/alt panelde üstteki sekmelerden <strong>&quot;Application&quot;</strong> (veya Safari&apos;de Storage) sekmesini bulun. Görünmüyorsa sağdaki ok (<strong>&gt;&gt;</strong>) işaretine tıklayın.</li>
                <li>Sol menüden <strong>Cookies</strong> &gt; <strong>https://www.instagram.com</strong> yolunu izleyin.</li>
                <li>Sağ taraftaki tabloda ismi <strong>sessionid</strong> olan satırı bulun. Karşısındaki değeri (uzun karmaşık metin) kopyalayın.</li>
              </ul>
            </div>

            <div>
              <strong style={{ color: "var(--color-text-primary)" }}>📱 Android (Kiwi Browser):</strong>
              <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                <li>Google Play&apos;den <strong>Kiwi Browser</strong> uygulamasını indirin ve Instagram&apos;a giriş yapın.</li>
                <li>Sağ üstteki üç noktaya tıklayıp menünün en altlarındaki <strong>&quot;Geliştirici Araçları&quot;</strong>nı (Developer Tools) açın.</li>
                <li>Açılan ekranda tıpkı bilgisayardaki gibi <strong>Application</strong> &gt; <strong>Cookies</strong> sekmesinden <strong>sessionid</strong> değerini kopyalayın.</li>
              </ul>
            </div>

            <div>
              <strong style={{ color: "var(--color-text-primary)" }}>🍏 iOS (iPhone / iPad):</strong>
              <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                <li>App Store&apos;dan <strong>&quot;Alook Browser&quot;</strong> veya çerez yöneticisi olan bir tarayıcı uygulaması edinin.</li>
                <li>Instagram&apos;a giriş yaptıktan sonra tarayıcının ayarlarındaki &quot;Çerezler&quot; (Cookies) bölümünden <strong>sessionid</strong> kaydını bulup kopyalayabilirsiniz.</li>
              </ul>
            </div>
          </div>
        </ExpandableInfoCard>

        <ExpandableInfoCard icon="🛡️" title="Neden İstiyoruz?">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
            <p style={{ margin: 0 }}>
              Instagram, sıradan uygulamaların kimin kimi takip ettiğini veya takipçi listelerini yüksek adetlerde çekmesine izin vermez.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Session ID (Oturum Kimliği)</strong>, sizin gözcü (fake) hesabınızla Instagram&apos;a başarıyla giriş yaptığınızı kanıtlayan geçici bir dijital anahtardır. Sistemimiz bu anahtarı kullanarak, <em>sanki o an siz kendi tarayıcınızdan Instagram&apos;a bakıyormuşsunuz gibi</em> davranır ve hedeflenen takipçi listelerini okur.
            </p>
            <div>
              <strong style={{ color: "var(--color-text-primary)" }}>Güvenli mi?</strong>
              <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                <li>Şifrenizi asla istemeyiz ve hiçbir yere kaydetmeyiz.</li>
                <li>Bu oturum kimliği sadece sizin belirttiğiniz hesabın verilerini analiz etmek için arka planda kullanılır. Sizin adınıza mesaj atılamaz veya paylaşım yapılamaz.</li>
                <li>Gözcü hesabınızdan &quot;Çıkış Yap&quot; dediğiniz an bu anahtarın ömrü biter ve geçersiz kalır.</li>
              </ul>
            </div>
          </div>
        </ExpandableInfoCard>
      </div>

      {/* Navigasyon */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <button type="button" onClick={onBack} style={ghostBtnStyle} disabled={loading}>
          ← Geri
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!canProceed}
          onClick={handleNext}
          style={{
            opacity: canProceed ? 1 : 0.45,
            cursor: canProceed ? "pointer" : "not-allowed",
            padding: "14px 36px",
          }}
        >
          {loading ? "Doğrulanıyor..." : "İleri →"}
        </button>
      </div>

      {/* Canlı Tut onay modalı */}
      {modalOpen && (
        <ConfirmModal
          icon="⚠️"
          title="Otomatik Ping Uyarısı"
          onCancel={handleModalCancel}
          onAccept={handleModalAccept}
          acceptLabel="Anladım, Aktif Et"
          cancelLabel="Vazgeç"
        >
          Bu özellik <strong>4-5 saatte bir</strong> ping atar.{" "}
          <strong>FAKE HESABINIZDAN ASLA ÇIKIŞ YAPMAMANIZ</strong> gerekmektedir. Aksi halde
          oturum geçersiz hale gelir ve analiz duraklar.
        </ConfirmModal>
      )}
    </div>
  );
}

// ─── Adım 3: Hedef Hesap ──────────────────────────────────────────────────────
function Step3TargetAccount({
  targetUsername,
  sessionId,
  onTargetUsernameChange,
  onBack,
  onComplete,
}: {
  targetUsername: string;
  sessionId: string;
  onTargetUsernameChange: (v: string) => void;
  onBack: () => void;
  onComplete: () => void;
}) {
  const inputId = useId();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const canComplete = targetUsername.trim().length > 0 && !loading;

  const handleComplete = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      const trimmedSessionId = sessionId.trim();
      const trimmedUsername  = targetUsername.trim().replace(/^@/, "");

      const res = await fetch("/api/ig/get-profile", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          username : trimmedUsername,
          sessionId: trimmedSessionId,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        setErrorMsg("Session Hatalı veya Sona Ermiş. Lütfen geçerli bir Session ID güncelleyin.");
        setLoading(false);
        return;
      }

      if (res.status === 404) {
        setErrorMsg("Hedef kullanıcı bulunamadı. Lütfen kullanıcı adını kontrol edin.");
        setLoading(false);
        return;
      }

      if (res.status === 429) {
        setErrorMsg("Instagram istek sınırına ulaşıldı. Birkaç dakika bekleyip tekrar deneyin.");
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
        const { saveAuthData } = await import("@/lib/idb");
        await saveAuthData(trimmedSessionId, trimmedUsername, data.targetId);
        onComplete();
      } else {
        setErrorMsg("Hedef ID alınamadı (API hatası).");
        setLoading(false);
      }
    } catch (err) {
      setErrorMsg("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.");
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <span style={{ fontSize: "2rem" }}>🎯</span>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "10px 0 4px" }}>
          Hedef Hesabı Belirle
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.92rem", lineHeight: 1.6 }}>
          Gözcü hesabın takip ettiği, analizi yapılacak ana hesabın kullanıcı adını gir.
        </p>
      </div>

      {errorMsg && (
        <InfoBanner tone="warning" icon="⚠️">
          {errorMsg}
        </InfoBanner>
      )}

      <div>
        <label htmlFor={inputId} style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 8 }}>
          Kullanıcı Adı
        </label>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }}>
            @
          </span>
          <input
            id={inputId}
            type="text"
            value={targetUsername}
            onChange={(e) => onTargetUsernameChange(e.target.value.replace(/\s/g, ""))}
            placeholder="kullaniciadi"
            autoComplete="off"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 16px 14px 32px",
              borderRadius: 12,
              border: "1.5px solid var(--color-border)",
              background: "var(--color-surface)",
              fontSize: "0.95rem",
              outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <button type="button" onClick={onBack} style={ghostBtnStyle} disabled={loading}>
          ← Geri
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!canComplete}
          onClick={handleComplete}
          style={{
            opacity: canComplete ? 1 : 0.45,
            cursor: canComplete ? "pointer" : "not-allowed",
            padding: "14px 28px",
          }}
        >
          {loading ? "Pre-Check Yapılıyor..." : "Kurulumu Tamamla ve Panele Git →"}
        </button>
      </div>
    </div>
  );
}

// ─── Paylaşılan Küçük Bileşenler ───────────────────────────────────────────────

function InfoBanner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "success" | "warning" | "info";
  icon: string;
  title?: string;
  children: React.ReactNode;
}) {
  const palette = {
    success: { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
    warning: { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c" },
    info: { bg: "var(--color-pink-1)", border: "var(--color-pink-2)", text: "var(--color-pink-5)" },
  }[tone];

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 14,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
      }}
    >
      <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: "0.86rem", lineHeight: 1.6, color: palette.text }}>
        {title && <strong style={{ display: "block", marginBottom: 2 }}>{title}</strong>}
        {children}
      </p>
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1.5px solid ${checked ? "var(--color-pink-4)" : "var(--color-border)"}`,
        background: checked ? "var(--color-pink-1)" : "var(--color-surface)",
        transition: "all 0.2s ease",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: "#ec4899", flexShrink: 0 }}
      />
      <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>{label}</span>
    </label>
  );
}

function SwitchToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        background: checked ? "linear-gradient(135deg, #ec4899, #f43f5e)" : "#e5e7eb",
        position: "relative",
        transition: "background 0.25s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          transition: "left 0.25s ease",
        }}
      />
    </button>
  );
}

function ExpandableInfoCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      style={{
        textAlign: "left",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "12px 14px",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: "0.82rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
        {icon} {title}
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
          {open ? "▲" : "▼"}
        </span>
      </span>
      {open && (
        <span
          style={{
            display: "block",
            fontSize: "0.78rem",
            color: "var(--color-text-secondary)",
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          {children}
        </span>
      )}
    </button>
  );
}

function ConfirmModal({
  icon,
  title,
  children,
  onAccept,
  onCancel,
  acceptLabel,
  cancelLabel,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  onAccept: () => void;
  onCancel: () => void;
  acceptLabel: string;
  cancelLabel: string;
}) {
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
          maxWidth: 420,
          width: "100%",
          boxShadow: "var(--shadow-card-hover)",
        }}
      >
        <div style={{ fontSize: "1.8rem", marginBottom: 10 }}>{icon}</div>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 10px" }}>{title}</h3>
        <p style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", lineHeight: 1.6, margin: 0 }}>
          {children}
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button type="button" onClick={onCancel} style={{ ...ghostBtnStyle, flex: 1 }}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onAccept}
            style={{ flex: 1, padding: "12px 0" }}
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Paylaşılan Stiller ───────────────────────────────────────────────────────
const ghostBtnStyle: React.CSSProperties = {
  padding: "13px 24px",
  borderRadius: 50,
  border: "1.5px solid var(--color-border)",
  background: "transparent",
  color: "var(--color-text-primary)",
  fontWeight: 600,
  fontSize: "0.9rem",
  cursor: "pointer",
};