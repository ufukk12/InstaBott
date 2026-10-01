"use client";

import { useState, memo } from "react";
import type { IgUser } from "@/lib/instagramApi";

export default memo(function UserRow({
  user,
  variant,
  onIgnore,
  onUnignore,
}: {
  user: IgUser;
  variant?: "admirer";
  /** Verilirse satırda "Yok say" butonu çıkar (GT listesi için) */
  onIgnore?: (user: IgUser) => void;
  /** Verilirse satırda "Geri al" butonu çıkar (yok sayılanlar penceresi için) */
  onUnignore?: (userId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isAdmirer = variant === "admirer";

  const baseBackground = isAdmirer
    ? "linear-gradient(135deg, #f0fdfa 0%, #e6fffa 100%)"
    : "transparent";
  const hoverBackground = isAdmirer
    ? "linear-gradient(135deg, #ccfbf1 0%, #99f6e4 30%, #f0fdfa 100%)"
    : "rgba(236,72,153,0.04)";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: `1px solid ${hovered ? (isAdmirer ? "#5eead4" : "var(--color-pink-2)") : "var(--color-border)"}`,
        background: hovered ? hoverBackground : baseBackground,
        boxShadow: hovered
          ? isAdmirer
            ? "0 2px 12px rgba(13,148,136,0.1)"
            : "0 2px 12px rgba(236,72,153,0.08)"
          : "none",
        transition: "all 0.25s ease",
        cursor: "default",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: isAdmirer
            ? "linear-gradient(135deg, #0d9488, #14b8a6)"
            : "var(--color-pink-1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: "0.85rem",
          color: isAdmirer ? "#fff" : "var(--color-pink-5)",
          flexShrink: 0,
          border: hovered
            ? isAdmirer ? "2px solid #0d9488" : "2px solid var(--color-pink-3)"
            : "2px solid transparent",
          transition: "border 0.25s ease",
        }}
      >
        {user.username[0]?.toUpperCase() ?? "?"}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
          <a
            href={`https://instagram.com/${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: hovered
                ? isAdmirer ? "#0d9488" : "var(--color-pink-5)"
                : "inherit",
              textDecoration: "none",
              transition: "color 0.2s ease",
            }}
          >
            @{user.username}
          </a>
        </p>
        <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {user.full_name || "—"} · ID: {user.id}
        </p>
      </div>
      {isAdmirer && (
        <span
          style={{
            flexShrink: 0,
            padding: "4px 10px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #0d9488, #14b8a6)",
            color: "#fff",
            fontSize: "0.7rem",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          Takipçilerinizde Yok
        </span>
      )}

      {onIgnore && (
        <button
          type="button"
          onClick={() => onIgnore(user)}
          title="Bu hesabı listeden çıkar (işletme hesabı, marka vb.)"
          style={{
            flexShrink: 0,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1.5px solid var(--color-border)",
            background: hovered ? "#fff" : "transparent",
            color: "var(--color-text-muted)",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            opacity: hovered ? 1 : 0.55,
            transition: "opacity 0.2s ease, background 0.2s ease",
          }}
        >
          Yok say
        </button>
      )}

      {onUnignore && (
        <button
          type="button"
          onClick={() => onUnignore(user.id)}
          title="Bu hesabı listeye geri getir"
          style={{
            flexShrink: 0,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1.5px solid #a7f3d0",
            background: "#ecfdf5",
            color: "#047857",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ↩ Geri al
        </button>
      )}
    </div>
  );
});
