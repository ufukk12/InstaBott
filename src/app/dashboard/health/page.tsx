"use client";

import { useState } from "react";
import { getAuthData } from "@/lib/idb";

type HealthResult = {
  score: number;
  status: "GREEN_FLAG" | "GRAY_FLAG" | "RED_FLAG";
  message: string;
  recoveryTips: string[];
  latency: number;
};

export default function HealthPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const auth = await getAuthData();
      if (!auth?.sessionId || !auth?.targetId) {
        setError("Gözcü hesabınızın oturum bilgisi bulunamadı. Lütfen ilk kurulumu tamamlayın.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/ig/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: auth.sessionId, userId: auth.targetId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || `Sunucu hatası: HTTP ${res.status}`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError("Bağlantı hatası oluştu. İnternetinizi kontrol edip tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  // Duruma göre renk belirleme
  const getStatusColor = (status?: string) => {
    if (status === "GREEN_FLAG") return "#10b981"; // Emerald
    if (status === "GRAY_FLAG") return "#f59e0b"; // Amber
    if (status === "RED_FLAG") return "#ef4444"; // Red
    return "var(--color-border)";
  };

  const getStatusIcon = (status?: string) => {
    if (status === "GREEN_FLAG") return "✅";
    if (status === "GRAY_FLAG") return "⚠️";
    if (status === "RED_FLAG") return "🛑";
    return "❓";
  };

  const getStatusLabel = (status?: string) => {
    if (status === "GREEN_FLAG") return "Mükemmel";
    if (status === "GRAY_FLAG") return "Kısmen Kısıtlı";
    if (status === "RED_FLAG") return "Kritik / Yasaklı";
    return "Bilinmiyor";
  };

  const currentColor = getStatusColor(result?.status);
  const currentScore = result?.score ?? 0;
  
  // Dairesel progress (SVG)
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (currentScore / 100) * circumference;

  return (
    <>
      <div className="container-xl" style={{ maxWidth: 800 }}>
        
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "0 0 8px 0" }}>
            🩺 Hesap Sağlık Testi
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem", margin: 0 }}>
            Analiz masasına geçmeden önce gözcü (fake) hesabınızın mevcut durumunu ve Instagram tarafından 
            kısıtlanıp kısıtlanmadığını (Trust Score) test edin.
          </p>
        </div>

        <div className="feature-card anim-fade-up" style={{ padding: "36px 32px" }}>
          
          {!result && !loading && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: "4rem", marginBottom: 16 }}>🧪</div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 12px 0" }}>
                Testi Başlatmaya Hazır Mısınız?
              </h3>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem", maxWidth: 500, margin: "0 auto 24px" }}>
                Bu işlem arka planda Instagram'a ufak bir deneme isteği atarak ağ hızını ve dönen verinin bütünlüğünü ölçer.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={runTest}
                style={{ padding: "14px 32px", fontSize: "1rem" }}
              >
                Sağlık Testini Başlat
              </button>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 40,
                  height: 40,
                  border: "4px solid var(--color-pink-1)",
                  borderTopColor: "var(--color-pink-5)",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  marginBottom: 16
                }}
              />
              <p style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>
                Hesap durumu analiz ediliyor... (Bu işlem birkaç saniye sürebilir)
              </p>
              <style>{`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to   { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          )}

          {error && !loading && (
            <div style={{ 
              padding: "16px 20px", 
              borderRadius: 12, 
              background: "#fef2f2", 
              border: "1px solid #fecaca", 
              color: "#b91c1c",
              textAlign: "center"
            }}>
              ⚠️ {error}
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={runTest}
                  style={{
                    background: "#b91c1c",
                    color: "white",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Tekrar Dene
                </button>
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="anim-fade-up">
              
              {/* Üst Kısım: Grafik ve Skor */}
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                gap: 20,
                paddingBottom: 32,
                borderBottom: "1px solid var(--color-border)"
              }}>
                <div style={{ position: "relative", width: 160, height: 160 }}>
                  <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
                    {/* Arka plan çemberi */}
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      fill="transparent"
                      stroke="var(--color-pink-1)"
                      strokeWidth="12"
                    />
                    {/* İlerleme çemberi */}
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      fill="transparent"
                      stroke={currentColor}
                      strokeWidth="12"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
                    />
                  </svg>
                  
                  {/* Merkezdeki skor */}
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <span style={{ fontSize: "2.4rem", fontWeight: 800, color: currentColor, lineHeight: 1 }}>
                      {result.score}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-muted)", marginTop: 4 }}>
                      / 100
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: "center" }}>
                  <h2 style={{ margin: "0 0 8px 0", fontSize: "1.4rem", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    {getStatusIcon(result.status)} <span style={{ color: currentColor }}>{getStatusLabel(result.status)}</span>
                  </h2>
                  <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: "0.95rem" }}>
                    {result.message}
                  </p>
                  {result.latency && (
                    <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", marginTop: 8 }}>
                      ⏱️ Yanıt Süresi: {result.latency} ms
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={runTest}
                  style={{
                    background: "transparent",
                    border: "1.5px solid var(--color-border)",
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    marginTop: 8
                  }}
                >
                  🔄 Yeniden Test Et
                </button>
              </div>

              {/* Alt Kısım: Tavsiyeler (Varsa) */}
              {result.recoveryTips && result.recoveryTips.length > 0 && (
                <div style={{ paddingTop: 32 }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 16px 0" }}>
                    💡 İyileştirme Tavsiyeleri
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {result.recoveryTips.map((tip, idx) => {
                      const isCritical = tip.includes("Kritik:");
                      return (
                        <div key={idx} style={{
                          padding: "16px",
                          borderRadius: 12,
                          background: isCritical ? "#fef2f2" : "var(--color-surface)",
                          border: `1px solid ${isCritical ? "#fecaca" : "var(--color-border)"}`,
                          display: "flex",
                          gap: 12,
                          alignItems: "flex-start"
                        }}>
                          <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>
                            {isCritical ? "⚠️" : "📌"}
                          </span>
                          <p style={{ 
                            margin: 0, 
                            fontSize: "0.9rem", 
                            lineHeight: 1.5,
                            color: isCritical ? "#991b1b" : "var(--color-text-primary)",
                            fontWeight: isCritical ? 600 : 400
                          }}>
                            {tip.replace("Kritik:", "").trim()}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </>
  );
}
