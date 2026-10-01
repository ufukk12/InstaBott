"use client";

export default function StatCard({
  icon,
  label,
  value,
  accent,
  teal,
}: {
  icon: string;
  label: string;
  value?: number;
  accent?: boolean;
  teal?: boolean;
}) {
  return (
    <div
      style={{
        background: teal ? "#f0fdfa" : accent ? "var(--color-pink-1)" : "var(--color-surface)",
        border: `1px solid ${teal ? "#99f6e4" : accent ? "var(--color-pink-2)" : "var(--color-border)"}`,
        borderRadius: 16,
        padding: "18px 14px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>{icon}</div>
      <p style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: teal ? "#0d9488" : accent ? "var(--color-pink-5)" : "inherit" }}>
        {value != null ? value.toLocaleString("tr-TR") : "—"}
      </p>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: 4, fontWeight: 600 }}>
        {label}
      </p>
    </div>
  );
}
