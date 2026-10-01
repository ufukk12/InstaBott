"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// ─── Özellik kartları için veri ─────────────────────────────────────────────
const features = [
  {
    icon: "🔒",
    iconBg: "linear-gradient(135deg,#fce7f3,#fbcfe8)",
    title: "%100 Şifresiz ve Güvenli",
    description:
      "Ana Instagram şifrenizi asla istemiyoruz. Sistemimiz yalnızca güvenli oturum (session cookie) teknolojisiyle çalışır. Verileriniz hiçbir zaman üçüncü taraflarla paylaşılmaz.",
    badge: "Güvenli",
  },
  {
    icon: "🎯",
    iconBg: "linear-gradient(135deg,#fdf2f8,#fce7f3)",
    title: "Nokta Atışı Analiz",
    description:
      "Sizi geri takip etmeyenleri, takipten çıkanları ve son 5 postunuzu beğenmeyen hayalet takipçileri tek tıkla listeleyin. Saniyeler içinde net sonuç.",
    badge: "Hızlı",
  },
  {
    icon: "📊",
    iconBg: "linear-gradient(135deg,#fff1f2,#fce7f3)",
    title: "Geçmişe Dönük Raporlama",
    description:
      "Verileriniz kendi hesabınızda güvenle işlenir. Sonraki girişlerinizde güncel durumunuz anında bir önceki analizle kıyaslanır.",
    badge: "Akıllı",
  },
];

// ─── İstatistik verileri ────────────────────────────────────────────────────
const stats = [
  { value: "30sn", label: "Ortalama Analiz Süresi" },
  { value: "%100", label: "Şifresiz & Güvenli" },
  { value: "3'ü 1", label: "Arada: Takip, Beğeni, Hayalet" },
];

// ─── Landing Page Bileşeni ──────────────────────────────────────────────────
export default function LandingPage() {
  // Scroll-reveal: .reveal sınıflı elementler görünürlük kazandıkça canlanır
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            // Bir kez görününce tekrar gözlemlemeye gerek yok
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = document.querySelectorAll(".reveal");
    elements.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <main
      style={{ backgroundColor: "var(--color-bg)", minHeight: "100vh", overflow: "hidden" }}
    >
      {/* ══════════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════════ */}
      <nav
        className="anim-fade-in"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          backgroundColor: "rgba(253,248,246,0.85)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          className="container-xl"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "64px",
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>📸</span>
            <span
              style={{
                fontWeight: 700,
                fontSize: "1.05rem",
                color: "var(--color-text-primary)",
              }}
            >
              Follower{" "}
              <span className="gradient-text">Tracker</span>
            </span>
          </div>

          {/* Nav CTA */}
          <Link
            href="/login"
            id="nav-login-btn"
            style={{
              padding: "10px 24px",
              background: "linear-gradient(135deg,#ec4899,#f43f5e)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.9rem",
              borderRadius: "50px",
              textDecoration: "none",
              boxShadow: "0 2px 12px rgba(236,72,153,0.25)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(236,72,153,0.4)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(236,72,153,0.25)";
            }}
          >
            Giriş Yap
          </Link>
        </div>
      </nav>

      {/* ══════════════════════════════════════════
          HERO ALANI
      ══════════════════════════════════════════ */}
      <section
        style={{
          position: "relative",
          paddingTop: "100px",
          paddingBottom: "90px",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        {/* Dekoratif arka plan blob'lar */}
        <div
          className="bg-blob"
          style={{
            width: "520px",
            height: "520px",
            background: "radial-gradient(circle, #fce7f3 0%, transparent 70%)",
            top: "-120px",
            left: "-120px",
            opacity: 0.7,
          }}
        />
        <div
          className="bg-blob"
          style={{
            width: "400px",
            height: "400px",
            background: "radial-gradient(circle, #fbcfe8 0%, transparent 70%)",
            top: "60px",
            right: "-100px",
            opacity: 0.5,
          }}
        />
        <div
          className="bg-blob"
          style={{
            width: "300px",
            height: "300px",
            background: "radial-gradient(circle, #fdf2f8 0%, transparent 70%)",
            bottom: "-60px",
            left: "40%",
            opacity: 0.6,
          }}
        />

        <div className="container-xl" style={{ position: "relative", zIndex: 1 }}>
          {/* Üst badge */}
          <div
            className="anim-fade-up shimmer-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 20px",
              borderRadius: "50px",
              border: "1px solid var(--color-pink-2)",
              fontSize: "0.82rem",
              fontWeight: 600,
              color: "#be185d",
              marginBottom: "28px",
            }}
          >
            <span>✨</span>
            <span>Ücretsiz · Güvenli · Hızlı</span>
          </div>

          {/* Ana başlık */}
          <h1
            className="anim-fade-up anim-delay-1"
            style={{
              fontSize: "clamp(2.2rem, 5.5vw, 3.75rem)",
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              color: "var(--color-text-primary)",
              margin: "0 0 24px",
              maxWidth: "800px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Instagram Takipçilerinizi{" "}
            <span className="gradient-text">Gerçekten</span>{" "}
            Tanıyın
          </h1>

          {/* Alt başlık */}
          <p
            className="anim-fade-up anim-delay-2"
            style={{
              fontSize: "clamp(1rem, 2vw, 1.2rem)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.75,
              maxWidth: "600px",
              margin: "0 auto 48px",
              fontWeight: 400,
            }}
          >
            Instagram ana hesabınızı güvende tutarak, sizi geri takip etmeyenleri{" "}
            <strong style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
              saniyeler içinde
            </strong>{" "}
            kolayca keşfedin.
          </p>

          {/* CTA Buton */}
          <div className="anim-fade-up anim-delay-3" style={{ display: "inline-block" }}>
            <div className="pulse-ring" style={{ borderRadius: "50px", display: "inline-block" }}>
              <Link
                href="/login"
                id="hero-cta-btn"
                className="btn-primary"
                style={{ fontSize: "1.05rem", padding: "20px 52px" }}
              >
                <span>🚀</span>
                <span>Ücretsiz Giriş Yapmak veya Kaydolmak için Tıklayın</span>
              </Link>
            </div>
            <p
              style={{
                marginTop: "14px",
                fontSize: "0.8rem",
                color: "var(--color-text-muted)",
              }}
            >
              Kredi kartı gerekmez · Kurulum yok · Anında başlayın
            </p>
          </div>

          {/* Hero görsel — floating emoji cluster */}
          <div
            className="anim-fade-up anim-delay-4 float-anim"
            style={{ marginTop: "56px" }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                padding: "20px 32px",
                background: "var(--color-surface)",
                borderRadius: "24px",
                border: "1px solid var(--color-border)",
                boxShadow: "var(--shadow-card)",
                fontSize: "1.6rem",
              }}
            >
              <span title="Analiz">📊</span>
              <span style={{ color: "var(--color-pink-4)", fontSize: "1.1rem" }}>→</span>
              <span title="Güvenlik">🔒</span>
              <span style={{ color: "var(--color-pink-4)", fontSize: "1.1rem" }}>→</span>
              <span title="Sonuçlar">✅</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          İSTATİSTİKLER ŞERIDI
      ══════════════════════════════════════════ */}
      <section style={{ padding: "40px 0", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="container-xl">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "32px",
              textAlign: "center",
            }}
          >
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className="reveal"
                style={{ transitionDelay: `${i * 0.1}s` }}
              >
                <div className="stat-number">{stat.value}</div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "0.85rem",
                    color: "var(--color-text-secondary)",
                    fontWeight: 500,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          ÖZELLİKLER ALANI
      ══════════════════════════════════════════ */}
      <section style={{ padding: "96px 0" }}>
        <div className="container-xl">
          {/* Bölüm başlığı */}
          <div
            className="reveal"
            style={{ textAlign: "center", marginBottom: "64px" }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "6px 16px",
                background: "var(--color-pink-1)",
                color: "#be185d",
                borderRadius: "50px",
                fontSize: "0.8rem",
                fontWeight: 600,
                marginBottom: "16px",
                border: "1px solid var(--color-pink-2)",
              }}
            >
              Neden Biz?
            </span>
            <h2
              style={{
                fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "var(--color-text-primary)",
                margin: "0 0 16px",
              }}
            >
              Her şey düşünüldü,{" "}
              <span className="gradient-text">sizin için</span>
            </h2>
            <p
              style={{
                color: "var(--color-text-secondary)",
                fontSize: "1.05rem",
                maxWidth: "480px",
                margin: "0 auto",
                lineHeight: 1.65,
              }}
            >
              Güvenlik, hız ve akıllı raporlama — tek bir platformda.
            </p>
          </div>

          {/* Kart ızgarası */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "28px",
            }}
          >
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="feature-card reveal"
                style={{ transitionDelay: `${i * 0.12}s` }}
              >
                {/* İkon */}
                <div
                  className="icon-badge"
                  style={{ background: feature.iconBg }}
                >
                  {feature.icon}
                </div>

                {/* Badge */}
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    background: "var(--color-pink-1)",
                    color: "#be185d",
                    borderRadius: "50px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    marginBottom: "12px",
                    border: "1px solid var(--color-pink-2)",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {feature.badge}
                </span>

                <h3
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    margin: "0 0 12px",
                    lineHeight: 1.35,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {feature.title}
                </h3>

                <p
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.7,
                    margin: 0,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          NASIL ÇALIŞIR — ADIMLAR
      ══════════════════════════════════════════ */}
      <section
        style={{
          padding: "80px 0",
          background: "linear-gradient(180deg, var(--color-pink-1) 0%, var(--color-bg) 100%)",
        }}
      >
        <div className="container-xl">
          <div className="reveal" style={{ textAlign: "center", marginBottom: "56px" }}>
            <h2
              style={{
                fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "var(--color-text-primary)",
                margin: "0 0 12px",
              }}
            >
              3 Adımda Hazır
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "1rem" }}>
              Karmaşık kurulum yok. Dakikalar içinde analize başlayın.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "24px",
            }}
          >
            {[
              {
                step: "01",
                icon: "📝",
                title: "Kayıt Ol",
                desc: "Sadece e-posta ve şifrenizle saniyeler içinde hesap oluşturun.",
              },
              {
                step: "02",
                icon: "🍪",
                title: "Session Cookie Girin",
                desc: "Fake bir Instagram hesabının session cookie'sini güvenle yapıştırın.",
              },
              {
                step: "03",
                icon: "📈",
                title: "Analizi Başlatın",
                desc: "Geri takip etmeyenler ve hayalet takipçileriniz anında listelenir.",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className="reveal"
                style={{
                  textAlign: "center",
                  padding: "36px 24px",
                  background: "var(--color-surface)",
                  borderRadius: "20px",
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-card)",
                  transitionDelay: `${i * 0.12}s`,
                }}
              >
                <div
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: "#ec4899",
                    letterSpacing: "0.15em",
                    marginBottom: "12px",
                    fontFamily: "monospace",
                  }}
                >
                  ADIM {item.step}
                </div>
                <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>{item.icon}</div>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    margin: "0 0 10px",
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          ALT CTA ALANI
      ══════════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", textAlign: "center" }}>
        <div
          className="reveal"
          style={{
            display: "inline-block",
            padding: "72px 48px",
            background: "var(--color-surface)",
            borderRadius: "32px",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-card)",
            maxWidth: "680px",
            width: "100%",
          }}
        >
          {/* Dekoratif ikon */}
          <div
            style={{
              width: "72px",
              height: "72px",
              margin: "0 auto 24px",
              borderRadius: "20px",
              background: "linear-gradient(135deg,#fce7f3,#fbcfe8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              border: "1px solid var(--color-pink-2)",
            }}
          >
            🎯
          </div>

          <h2
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.1rem)",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 16px",
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
            }}
          >
            Hemen Başlayın,{" "}
            <span className="gradient-text">Ücretsiz</span>
          </h2>

          <p
            style={{
              color: "var(--color-text-secondary)",
              fontSize: "1rem",
              lineHeight: 1.7,
              margin: "0 0 40px",
              maxWidth: "440px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Binlerce kullanıcı gibi siz de takipçi listenizi şeffaf hale getirin.
            Hiçbir ücret, hiçbir gizli koşul.
          </p>

          <Link
            href="/login"
            id="bottom-cta-btn"
            className="btn-primary"
          >
            <span>✨</span>
            <span>Ücretsiz Giriş Yapmak veya Kaydolmak için Tıklayın</span>
          </Link>

          {/* Güven mühürleri */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "24px",
              marginTop: "32px",
              flexWrap: "wrap",
            }}
          >
            {["🔒 SSL Şifrelemeli", "🚫 Şifre İstemez", "⚡ Anında Analiz"].map(
              (badge) => (
                <span
                  key={badge}
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--color-text-secondary)",
                    fontWeight: 500,
                  }}
                >
                  {badge}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════ */}
      <footer
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          <span style={{ fontSize: "18px" }}>📸</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.95rem",
              color: "var(--color-text-primary)",
            }}
          >
            Follower <span className="gradient-text">Tracker</span>
          </span>
        </div>
        <p
          style={{
            color: "var(--color-text-muted)",
            fontSize: "0.8rem",
            margin: 0,
          }}
        >
          © {new Date().getFullYear()} Instagram Follower Tracker. Bu servis Instagram
          tarafından onaylanmamış, bağımsız bir araçtır.
        </p>
      </footer>
    </main>
  );
}
