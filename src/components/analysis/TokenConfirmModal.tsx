"use client";

import { useEffect, useState } from "react";

interface TokenConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TokenConfirmModal({ isOpen, onConfirm, onCancel }: TokenConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        style={{
          background: "var(--color-bg)",
          borderRadius: 24,
          padding: 32,
          width: "90%",
          maxWidth: 420,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid var(--color-border)",
          animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow effect */}
        <div
          style={{
            position: "absolute",
            top: -100,
            left: -100,
            right: -100,
            height: 200,
            background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "linear-gradient(135deg, #fef3c7, #fde68a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: "2rem",
              border: "1px solid #fcd34d",
              boxShadow: "0 10px 15px -3px rgba(251, 191, 36, 0.2)",
            }}
          >
            🪙
          </div>
          <h3 style={{ margin: "0 0 12px", fontSize: "1.4rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
            Token Harcama Onayı
          </h3>
          <p style={{ margin: "0 0 28px", color: "var(--color-text-secondary)", lineHeight: 1.6, fontSize: "0.95rem" }}>
            Günlük ücretsiz analiz hakkınızı kullandınız. İşleme devam etmek için <strong>1 Token</strong> harcamak ister misiniz?
          </p>
          
          <div style={{ display: "flex", gap: 12, width: "100%" }}>
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 12,
                border: "1.5px solid var(--color-border)",
                background: "transparent",
                color: "var(--color-text-primary)",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--color-surface)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              İptal Et
            </button>
            <button
              onClick={onConfirm}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px 0 rgba(99,102,241,0.39)",
                transition: "all 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(99,102,241,0.4)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 14px 0 rgba(99,102,241,0.39)";
              }}
            >
              Onayla ve Başlat
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
