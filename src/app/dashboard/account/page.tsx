"use client";

import { useUser } from "@/context/UserContext";

export default function AccountPage() {
  // UserContext'ten kullanıcı bilgilerini al — yeniden fetch yok, sabit kalır
  const { user, loading } = useUser();

  const maskEmail = (email: string) => {
    const [name, domain] = email.split("@");
    if (!name || !domain) return email;
    return `${name.charAt(0)}***@${domain}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (loading || !user) {
    return (
      <>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            padding: "80px 48px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            {/* Skeleton shimmer animasyonu */}
            <div
              style={{
                width: 180,
                height: 24,
                borderRadius: 8,
                background: "linear-gradient(90deg, #f3e8e2 25%, #fce7f3 50%, #f3e8e2 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
                margin: "0 auto 16px",
              }}
            />
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
              Hesap bilgileri yükleniyor...
            </p>
          </div>
        </div>
      </>
    );
  }

  const registrationDate = new Date(user.createdAt).toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <div
        style={{ padding: "48px 32px", maxWidth: "900px", margin: "0 auto" }}
        className="anim-fade-up"
      >
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 800,
            marginBottom: "8px",
            color: "var(--color-text-primary)",
          }}
        >
          Hesap Bilgileri
        </h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "32px", fontSize: "0.95rem" }}>
          {user.isVip ? "👑 VIP Hesap — Sınırsız Erişim" : "Ücretsiz Plan"}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "24px",
          }}
        >
          {/* Kullanıcı ID Kartı */}
          <div className="feature-card">
            <h3
              style={{
                fontSize: "0.8rem",
                color: "var(--color-text-muted)",
                marginBottom: "16px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Kullanıcı Kimliği
            </h3>
            <div
              style={{
                background: "var(--color-bg)",
                padding: "16px 20px",
                borderRadius: "12px",
                border: "1px dashed var(--color-pink-3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "3px" }}
                className="gradient-text"
              >
                {user.displayId}
              </span>
              <button
                onClick={() => copyToClipboard(user.displayId)}
                style={{
                  background: "var(--color-pink-1)",
                  color: "var(--color-pink-5)",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  transition: "opacity 0.2s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = "0.8")}
                onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Kopyala
              </button>
            </div>
          </div>

          {/* Profil Detayları */}
          <div className="feature-card">
            <h3
              style={{
                fontSize: "0.8rem",
                color: "var(--color-text-muted)",
                marginBottom: "20px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Profil Detayları
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--color-border)",
                  paddingBottom: "14px",
                }}
              >
                <span style={{ color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.88rem" }}>
                  E-posta Adresi
                </span>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{maskEmail(user.email)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "var(--color-text-muted)", fontWeight: 500, fontSize: "0.88rem" }}>
                  Kayıt Tarihi
                </span>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{registrationDate}</span>
              </div>
            </div>
          </div>

          {/* Token Bakiyesi */}
          <div
            className="feature-card"
            style={{
              background: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
              color: "white",
              border: "none",
            }}
          >
            <h3
              style={{
                fontSize: "0.8rem",
                color: "rgba(255,255,255,0.75)",
                marginBottom: "8px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Mevcut Bakiye
            </h3>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              <span style={{ fontSize: "3.5rem", fontWeight: 800, lineHeight: 1 }}>
                {user.followerTokens}
              </span>
              <span style={{ fontSize: "1.2rem", fontWeight: 600, opacity: 0.9 }}>Token</span>
            </div>
            <a
              href="#"
              style={{
                display: "block",
                background: "white",
                color: "#ec4899",
                border: "none",
                padding: "13px 24px",
                borderRadius: "12px",
                fontWeight: 700,
                width: "100%",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                textAlign: "center",
                textDecoration: "none",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            >
              🪙 Token Satın Al
            </a>
          </div>

          {/* Kullanım İstatistikleri */}
          <div className="feature-card">
            <h3
              style={{
                fontSize: "0.8rem",
                color: "var(--color-text-muted)",
                marginBottom: "20px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Kullanım İstatistikleri
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Günlük */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--color-border)",
                  paddingBottom: "14px",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
                    Bugünkü Analiz
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {user.dailyFreeRemaining > 0
                      ? `${user.dailyFreeRemaining} ücretsiz hak kaldı`
                      : "Günlük ücretsiz hak kullanıldı"}
                  </p>
                </div>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "1.4rem",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {user.todayUsage}
                </span>
              </div>
              {/* Aylık */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
                    Bu Ay Toplam
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {user.monthlyFreeRemaining > 0
                      ? `${user.monthlyFreeRemaining} aylık hak kaldı`
                      : "Aylık ücretsiz haklar bitti"}
                  </p>
                </div>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "1.4rem",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {user.monthUsage}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
