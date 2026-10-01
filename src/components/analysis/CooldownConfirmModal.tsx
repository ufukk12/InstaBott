"use client";

import { useEffect, useState } from "react";

interface CooldownConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onUseDifferentAccount: () => void;
}

export default function CooldownConfirmModal({ isOpen, onConfirm, onCancel, onUseDifferentAccount }: CooldownConfirmModalProps) {
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
        width: "100%",
        height: "100%",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "400px",
          padding: "32px 24px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
          position: "relative",
          animation: "modalFadeIn 0.3s ease-out forwards",
        }}
      >
        <div style={{ textAlign: "center", padding: "0 10px" }}>
          <div style={{
            width: "64px",
            height: "64px",
            background: "rgba(245, 158, 11, 0.15)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            color: "#f59e0b"
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          
          <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-primary)" }}>
            Doğru Sonuçlar İçin Beklemeniz Önerilir
          </h3>
          
          <p style={{ fontSize: "1rem", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "32px" }}>
            Bu gözcü hesabı ile doğru sonuçlar için 3 saat sonra analiz yapmanız önerilmektedir. 
            Yine de aynı gözcü hesabı ile analiz yapmak istiyor musunuz?
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              onClick={onConfirm}
              style={{
                padding: "14px 24px",
                background: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "12px",
                fontWeight: 600,
                fontSize: "1rem",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px"
              }}
            >
              Evet, Riski Kabul Ediyorum
            </button>
            
            <button
              onClick={onUseDifferentAccount}
              style={{
                padding: "14px 24px",
                background: "rgba(139, 92, 246, 0.1)",
                color: "#a78bfa",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                borderRadius: "12px",
                fontWeight: 600,
                fontSize: "1rem",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px"
              }}
            >
              Farklı bir gözcü hesabı kullanmak istiyorum
            </button>
  
            <button
              onClick={onCancel}
              style={{
                padding: "14px 24px",
                background: "rgba(255, 255, 255, 0.05)",
                color: "var(--color-text-primary)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "12px",
                fontWeight: 600,
                fontSize: "1rem",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px"
              }}
            >
              Hayır, Bekleyeceğim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
