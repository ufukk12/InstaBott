"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!targetId || targetId.length !== 7) {
      setMessage({ text: "Hedef Kullanıcı ID 7 haneli olmalıdır.", type: "error" });
      return;
    }
    const tokenAmount = parseInt(amount, 10);
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
      setMessage({ text: "Geçerli bir bilet miktarı girin.", type: "error" });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setMessage({ text: "Oturum bulunamadı, lütfen tekrar giriş yapın.", type: "error" });
        return;
      }

      const res = await fetch("/api/admin/add-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ targetId, amount: tokenAmount })
      });
      const data = await res.json();

      if (res.ok) {
        setMessage({ text: data.message || "İşlem başarılı.", type: "success" });
        setTargetId("");
        setAmount("");
      } else {
        setMessage({ text: data.error || "İşlem sırasında bir hata oluştu.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("auth_token");
    const { clearAllAnalysisData, clearAuthData } = await import("@/lib/idb");
    await clearAllAnalysisData();
    await clearAuthData();
    router.push("/login");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--color-bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
    }}>
      <div className="anim-fade-up" style={{
        width: "100%",
        maxWidth: "480px",
        background: "var(--color-surface)",
        borderRadius: "24px",
        border: "1px solid var(--color-border)",
        boxShadow: "0 8px 48px -8px rgba(0,0,0,0.1)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "24px",
          background: "linear-gradient(90deg, #ec4899, #f43f5e)",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>Ticket Yönetim Paneli</h1>
          <button 
            onClick={handleLogout}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "white",
              padding: "6px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            Çıkış Yap
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "32px" }}>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", marginBottom: "24px", lineHeight: 1.6 }}>
            Bu alandan sistemdeki kullanıcılara FollowerToken yükleyebilirsiniz. 
            İşlem anında kullanıcının hesabına yansır ve satın alma geçmişine eklenir.
          </p>

          {message && (
            <div style={{
              padding: "12px 16px",
              borderRadius: "10px",
              background: message.type === "success" ? "#f0fdf4" : "#fff1f2",
              border: `1px solid ${message.type === "success" ? "#bbf7d0" : "#fecdd3"}`,
              color: message.type === "success" ? "#15803d" : "#be123c",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: "20px"
            }}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px" }}>
                Hedef Kullanıcı ID
              </label>
              <input
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="Örn: a7k3x9m"
                maxLength={7}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1.5px solid var(--color-border)",
                  fontSize: "1rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px" }}>
                Yüklenecek Ticket Miktarı
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Örn: 5"
                min={1}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1.5px solid var(--color-border)",
                  fontSize: "1rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px",
                background: loading ? "#ccc" : "#1e293b",
                color: "white",
                fontWeight: 700,
                fontSize: "1rem",
                border: "none",
                borderRadius: "12px",
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: "8px",
                transition: "background 0.2s"
              }}
            >
              {loading ? "Yükleniyor..." : "Yükle"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
