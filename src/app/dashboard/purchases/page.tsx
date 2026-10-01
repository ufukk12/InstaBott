"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { clientLogger, clientErrorMeta } from "@/lib/clientLogger";

interface Purchase {
  id: string;
  amount: number;
  createdAt: string;
}

export default function PurchasesPage() {
  const { user, loading: userLoading } = useUser();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPurchases() {
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) return;
        const res = await fetch("/api/tokens/purchases", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (data.purchases) {
          setPurchases(data.purchases);
        }
      } catch (err) {
        clientLogger.error("satin-alma", "Satın alma geçmişi alınamadı", clientErrorMeta(err));
      } finally {
        setLoading(false);
      }
    }

    if (!userLoading) {
      fetchPurchases();
    }
  }, [userLoading]);

  if (userLoading) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "center", padding: "80px" }}>
          Yükleniyor...
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ padding: "48px 32px", maxWidth: "900px", margin: "0 auto" }} className="anim-fade-up">
        
        {/* Shopier Uyarısı */}
        <div style={{
          background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
          border: "1px solid #fde68a",
          borderRadius: "16px",
          padding: "20px 24px",
          marginBottom: "32px",
          display: "flex",
          gap: "16px",
          alignItems: "flex-start",
          boxShadow: "0 4px 20px -8px rgba(217, 119, 6, 0.2)"
        }}>
          <span style={{ fontSize: "1.8rem", lineHeight: 1 }}>⚠️</span>
          <div>
            <h4 style={{ margin: "0 0 8px 0", color: "#b45309", fontSize: "1.05rem", fontWeight: 700 }}>
              ÖNEMLİ BİLGİLENDİRME
            </h4>
            <p style={{ margin: 0, color: "#92400e", fontSize: "0.95rem", lineHeight: 1.6 }}>
              Bilet satın alırken Shopier üzerindeki 'Açıklama' kısmına kesinlikle 
              <strong style={{ background: "#fef08a", padding: "2px 6px", borderRadius: "4px", margin: "0 4px", fontSize: "1rem", letterSpacing: "1px" }}>
                {user?.displayId}
              </strong> 
              olan 7 haneli ID değerinizi girmelisiniz. Aksi takdirde biletiniz hesabınıza tanımlanamaz!
            </p>
          </div>
        </div>

        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "32px", color: "var(--color-text-primary)" }}>
          Satın Alma Geçmişi
        </h1>

        <div className="feature-card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ 
            width: "80px", 
            height: "80px", 
            margin: "0 auto 24px", 
            background: "var(--color-pink-1)", 
            borderRadius: "50%", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            fontSize: "2rem"
          }}>
            🛒
          </div>
          
          <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "12px", color: "var(--color-text-primary)" }}>
            Token Bakiyenizi Artırın
          </h2>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "32px", maxWidth: "400px", margin: "0 auto 32px", lineHeight: 1.6 }}>
            Daha fazla analiz yapmak ve derinlemesine istatistiklere ulaşmak için FollowerToken satın alabilirsiniz.
          </p>

          <button className="btn-primary" style={{ padding: "16px 36px", fontSize: "1.05rem" }}>
            FollowerToken Satın Al
          </button>
        </div>

        <div style={{ marginTop: "48px" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "20px" }}>Geçmiş İşlemler</h3>
          <div style={{ 
            background: "var(--color-surface)", 
            borderRadius: "16px", 
            border: "1px solid var(--color-border)",
            overflow: "hidden"
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "16px 24px", color: "var(--color-text-secondary)", fontWeight: 600, fontSize: "0.9rem" }}>Tarih</th>
                  <th style={{ padding: "16px 24px", color: "var(--color-text-secondary)", fontWeight: 600, fontSize: "0.9rem" }}>İşlem Detayı</th>
                  <th style={{ padding: "16px 24px", color: "var(--color-text-secondary)", fontWeight: 600, fontSize: "0.9rem" }}>Tutar</th>
                  <th style={{ padding: "16px 24px", color: "var(--color-text-secondary)", fontWeight: 600, fontSize: "0.9rem" }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "var(--color-text-muted)" }}>
                      Yükleniyor...
                    </td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "var(--color-text-muted)" }}>
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  purchases.map((purchase) => (
                    <tr key={purchase.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "16px 24px", fontSize: "0.95rem" }}>
                        {new Date(purchase.createdAt).toLocaleString("tr-TR")}
                      </td>
                      <td style={{ padding: "16px 24px", fontSize: "0.95rem" }}>
                        FollowerToken Yükleme
                      </td>
                      <td style={{ padding: "16px 24px", fontSize: "0.95rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
                        +{purchase.amount}
                      </td>
                      <td style={{ padding: "16px 24px", fontSize: "0.95rem" }}>
                        <span style={{ 
                          background: "#dcfce7", 
                          color: "#166534", 
                          padding: "4px 8px", 
                          borderRadius: "6px", 
                          fontSize: "0.8rem", 
                          fontWeight: 600 
                        }}>
                          Tamamlandı
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}
