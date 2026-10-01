"use client";

import { useState, memo } from "react";
import type { UnfollowerHistoryRecord } from "@/lib/indexedDbManager";

export default memo(function HistoryGroup({
  record,
  sessionNumber,
}: {
  record: UnfollowerHistoryRecord;
  sessionNumber: number;
}) {
  const [expanded, setExpanded] = useState(true);

  const date = new Date(record.timestamp).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const diff = record.followersCountAfter - record.followersCountBefore;
  const diffText = diff < 0 ? `${diff}` : diff > 0 ? `+${diff}` : "±0";

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          background: "linear-gradient(135deg, #faf5ff, #f3e8ff)",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              color: "#fff",
              fontSize: "0.72rem",
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {sessionNumber}
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem", color: "#5b21b6" }}>
              {sessionNumber}. Analiz Karşılaştırması
            </p>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#7c3aed" }}>
              {date}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              background: "#fce7f3",
              color: "#9d174d",
              fontWeight: 700,
              fontSize: "0.78rem",
            }}
          >
            -{record.unfollowers.length} kişi takipten çıktı
          </span>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              background: diff < 0 ? "#fee2e2" : "#dcfce7",
              color: diff < 0 ? "#991b1b" : "#166534",
              fontWeight: 700,
              fontSize: "0.78rem",
            }}
          >
            {diffText} net
          </span>
          <span style={{ color: "#7c3aed", fontSize: "0.9rem" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div>
          {record.unfollowers.map((u) => (
            <div
              key={u.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 20px",
                borderBottom: "1px solid var(--color-border)",
                background: "#fdf4ff",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5e6ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fdf4ff")}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  flexShrink: 0,
                }}
              >
                {u.username?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <a
                  href={`https://instagram.com/${u.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontWeight: 600, fontSize: "0.88rem", color: "inherit", textDecoration: "none" }}
                >
                  @{u.username}
                </a>
                {u.full_name && (
                  <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--color-text-muted)" }}>
                    {u.full_name}
                  </p>
                )}
              </div>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "#fce7f3",
                  color: "#9d174d",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Takipten Çıktı
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
