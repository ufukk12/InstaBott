"use client";

import { useEffect, useRef } from "react";

export interface LogEntry {
  timestamp: string;
  type: 'success' | 'progress' | 'warning' | 'error' | 'info';
  message: string;
}

interface LiveLogTerminalProps {
  logs: LogEntry[];
  isActive: boolean;
}

export default function LiveLogTerminal({ logs, isActive }: LiveLogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const getIconAndColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return { icon: '✓', color: '#10b981' };
      case 'progress': return { icon: '⟳', color: '#f59e0b', spin: true };
      case 'warning': return { icon: '⚠', color: '#eab308' };
      case 'error': return { icon: '✕', color: '#ef4444' };
      case 'info': return { icon: 'ℹ', color: '#3b82f6' };
      default: return { icon: '•', color: '#9ca3af' };
    }
  };

  return (
    <div style={{
      background: "#0d1117",
      borderRadius: "16px",
      overflow: "hidden",
      boxShadow: isActive ? "0 0 20px rgba(99, 102, 241, 0.2)" : "0 4px 20px rgba(0,0,0,0.3)",
      border: "1px solid #30363d",
      transition: "box-shadow 0.3s ease"
    }}>
      {/* Top Bar (macOS style) */}
      <div style={{
        background: "#161b22",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid #30363d"
      }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ff5f56" }} />
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ffbd2e" }} />
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#27c93f" }} />
        </div>
        <div style={{ flex: 1, textAlign: "center", color: "#8b949e", fontSize: "0.85rem", fontWeight: 600, fontFamily: "system-ui, sans-serif" }}>
          Canlı Akış {isActive && <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#27c93f", marginLeft: "6px", animation: "pulseRing 2s infinite" }} />}
        </div>
      </div>

      {/* Terminal Body */}
      <div 
        ref={containerRef}
        style={{
          height: "320px",
          overflowY: "auto",
          padding: "16px",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace",
          fontSize: "0.9rem",
          lineHeight: "1.6"
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: "#8b949e", fontStyle: "italic", textAlign: "center", marginTop: "20px" }}>
            Analiz bekleniyor...
          </div>
        ) : (
          logs.map((log, index) => {
            const { icon, color, spin } = getIconAndColor(log.type);
            return (
              <div 
                key={index} 
                className="anim-fade-in"
                style={{ 
                  display: "flex", 
                  gap: "12px",
                  marginBottom: "8px",
                  wordBreak: "break-word"
                }}
              >
                <span style={{ color: "#8b949e", minWidth: "85px" }}>[{log.timestamp}]</span>
                <span 
                  style={{ 
                    color, 
                    fontWeight: "bold",
                    display: "inline-block",
                    animation: spin ? "spin 2s linear infinite" : "none" 
                  }}
                >
                  {icon}
                </span>
                <span style={{ color: "#c9d1d9" }}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
