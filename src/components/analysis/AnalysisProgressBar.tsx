"use client";

import React from "react";

interface AnalysisProgressBarProps {
  progress: number;
  step: string;
  isActive: boolean;
}

export default function AnalysisProgressBar({ progress, step, isActive }: AnalysisProgressBarProps) {
  // Ensure progress is between 0 and 100
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div style={{ 
      width: "100%", 
      display: "flex", 
      flexDirection: "column", 
      gap: "14px", 
      background: "var(--color-surface, #ffffff)", 
      padding: "20px", 
      borderRadius: "16px", 
      border: "1px solid var(--color-border, #e5e7eb)", 
      boxShadow: "0 8px 30px rgba(0,0,0,0.04)" 
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
        <span style={{ 
          fontSize: "0.95rem", 
          color: "var(--color-text-primary, #111827)", 
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}>
          {isActive ? (
            <svg 
              width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
              style={{ animation: "spin 2s linear infinite", color: "#ec4899" }}
            >
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <span style={{ fontSize: "1.1rem" }}>✅</span>
          )}
          {step || "Analiz ediliyor..."}
        </span>
        <span style={{ 
          fontSize: "1.1rem", 
          fontWeight: 800, 
          color: "transparent",
          background: "linear-gradient(90deg, #ec4899 0%, #8b5cf6 100%)",
          WebkitBackgroundClip: "text",
          fontVariantNumeric: "tabular-nums"
        }}>
          {Math.round(clampedProgress)}%
        </span>
      </div>

      <div 
        style={{
          width: "100%",
          height: "14px",
          background: "var(--color-background, #f3f4f6)",
          borderRadius: "8px",
          overflow: "hidden",
          position: "relative",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)"
        }}
      >
        <div 
          style={{
            height: "100%",
            width: `${clampedProgress}%`,
            background: "linear-gradient(90deg, #ec4899 0%, #8b5cf6 50%, #3b82f6 100%)",
            backgroundSize: "200% 100%",
            borderRadius: "8px",
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
            animation: isActive ? "shimmerProgress 2s linear infinite" : "none",
            boxShadow: isActive ? "0 0 12px rgba(236, 72, 153, 0.5)" : "none"
          }}
        />
      </div>
      
      <style>{`
        @keyframes shimmerProgress {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
