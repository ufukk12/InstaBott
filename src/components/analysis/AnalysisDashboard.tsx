"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IgUser } from "@/lib/instagramApi";
import { downloadCsv, usersToCsv } from "@/lib/csvExport";
import LiveLogTerminal from "@/components/analysis/LiveLogTerminal";
import AnalysisProgressBar from "@/components/analysis/AnalysisProgressBar";
import TokenConfirmModal from "@/components/analysis/TokenConfirmModal";
import CooldownConfirmModal from "@/components/analysis/CooldownConfirmModal";
import UserRow from "@/components/analysis/UserRow";
import HistoryGroup from "@/components/analysis/HistoryGroup";
import StatCard from "@/components/analysis/StatCard";
import { useAnalysisState, type TabId } from "@/hooks/useAnalysisState";

export default function AnalysisDashboard({
  targetUsername,
  onSessionExpired,
  onChangeTarget,
  onRequireNewSession,
}: {
  targetUsername: string;
  onSessionExpired?: () => void;
  onChangeTarget?: () => void;
  onRequireNewSession?: () => void;
}) {
  const state = useAnalysisState({ targetUsername, onSessionExpired, onRequireNewSession });
  
  // Custom event listener to start analysis when new session is provided
  useEffect(() => {
    const handleStartEvent = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail && customEvent.detail.username) {
            state.runAnalysis(customEvent.detail.username);
        }
    };
    window.addEventListener('startAnalysisEvent', handleStartEvent);
    return () => window.removeEventListener('startAnalysisEvent', handleStartEvent);
  }, [state.runAnalysis]);

  const {
    auth,
    followers,
    notFollowers,
    ghostFollowers,
    secretAdmirers,
    profileStats,
    lastAnalysisAt,
    activeTab,
    setActiveTab,
    isRunning,
    isGhostRunning,
    progress,
    error,
    toastContainer,
    unfollowerModal,
    liveLogs,
    tokenError,
    historyRecords,
    tokenConfirmConfig,
    cooldownConfirmConfig,
    setCooldownConfirmConfig,
    setTokenConfirmConfig,
    cooldownRemaining,
    handleStartAnalysis,
    handleStartGhostAnalysis,
    activeList,
    anyRunning,
    pct,
    visibleNotFollowers,
    ignoredUsers,
    ignoreUser,
    unignoreUser,
    gtMissingCount,
    isVerifyingGt,
    gtVerifyMessage,
    gtVerifyCountdown,
    canVerifyGt,
    handleVerifyGtList,
  } = state;

  const handleExport = useCallback(
    (list: IgUser[], filename: string) => {
      downloadCsv(filename, usersToCsv(list));
    },
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {toastContainer}
      {unfollowerModal}
      <TokenConfirmModal
        isOpen={tokenConfirmConfig?.isOpen ?? false}
        onConfirm={() => {
          if (tokenConfirmConfig?.action) tokenConfirmConfig.action();
          setTokenConfirmConfig(null);
        }}
        onCancel={() => setTokenConfirmConfig(null)}
      />

      <CooldownConfirmModal
        isOpen={cooldownConfirmConfig?.isOpen ?? false}
        onConfirm={() => {
          if (cooldownConfirmConfig?.action) cooldownConfirmConfig.action();
          setCooldownConfirmConfig(null);
        }}
        onCancel={() => setCooldownConfirmConfig(null)}
        onUseDifferentAccount={() => {
          setCooldownConfirmConfig(null);
          if (onRequireNewSession) onRequireNewSession();
        }}
      />

      {/* ─── Başlık + Butonlar ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0 }}>
            Analiz Paneli
          </h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.88rem", margin: "4px 0 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            Hedef: <strong>@{auth?.targetUsername || targetUsername || "—"}</strong>
            <button
              type="button"
              onClick={onChangeTarget}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: "0.75rem",
                cursor: "pointer",
                fontWeight: 600,
                color: "var(--color-text-primary)"
              }}
            >
              Değiştir
            </button>
            {lastAnalysisAt && (
              <span style={{ color: "var(--color-text-muted)" }}>
                · Son analiz: {new Date(lastAnalysisAt).toLocaleString("tr-TR")}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* ─── Analiz Başlat Butonu (Kilitleme Özellikli) ─────────── */}
          <button
            type="button"
            className="btn-primary"
            disabled={anyRunning || !auth || cooldownRemaining !== null}
            onClick={handleStartAnalysis}
            style={{
              padding: "12px 24px",
              opacity: anyRunning || !auth || cooldownRemaining !== null ? 0.6 : 1,
              cursor: anyRunning || !auth || cooldownRemaining !== null ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "opacity 0.2s ease",
            }}
          >
            {isRunning ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.35)",
                    borderTopColor: "#ffffff",
                    borderRadius: "50%",
                    animation: "spin 0.75s linear infinite",
                    flexShrink: 0,
                  }}
                />
                Analiz Ediliyor...
              </>
            ) : cooldownRemaining ? (
              <>⏳ Kalan Süre: {cooldownRemaining}</>
            ) : "Analizi Başlat"}
          </button>
          <button
            type="button"
            disabled={anyRunning || !auth || followers.length === 0}
            onClick={handleStartGhostAnalysis}
            style={{
              padding: "12px 20px",
              borderRadius: 12,
              border: "1.5px solid #0d9488",
              background: isGhostRunning ? "#f0fdfa" : "transparent",
              fontWeight: 600,
              fontSize: "0.85rem",
              color: "#0d9488",
              cursor: anyRunning || followers.length === 0 ? "not-allowed" : "pointer",
              opacity: anyRunning || followers.length === 0 ? 0.5 : 1,
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isGhostRunning ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 13,
                    height: 13,
                    border: "2px solid rgba(13,148,136,0.3)",
                    borderTopColor: "#0d9488",
                    borderRadius: "50%",
                    animation: "spin 0.75s linear infinite",
                    flexShrink: 0,
                  }}
                />
                Hayalet Analiz Devam Ediyor...
              </>
            ) : "👻 Hayalet Takipçi Analizi"}
          </button>
        </div>
      </div>

      {/* ─── 🎫 Token Hatası ─────────────────────────────────────────────────── */}
      {tokenError && (
        <div style={{
          padding: "16px 20px",
          borderRadius: 12,
          background: "linear-gradient(135deg, #fef3c7, #fde68a)",
          border: "1px solid #f59e0b",
          color: "#92400e",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: "0.9rem",
          fontWeight: 600,
        }}>
          <span style={{ fontSize: "1.3rem" }}>🪙</span>
          <div style={{ flex: 1 }}>{tokenError}</div>
          <a
            href="#"
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: "0.8rem",
              whiteSpace: "nowrap",
            }}
          >
            🎫 Token Satın Al
          </a>
        </div>
      )}

      {error && (
        <div style={bannerStyle("#fff7ed", "#fed7aa", "#c2410c")}>
          ⚠️ {error}
        </div>
      )}

      {/* ─── İlerleme Çubuğu + Uyarılar + Canlı Terminal ─────────────────── */}
      {anyRunning && progress && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <AnalysisProgressBar
            progress={pct}
            step={progress.message}
            isActive={anyRunning}
          />

          {/* Sekme Uyutma (Tab Throttling) Uyarısı */}
          <div
            style={{
              padding: "12px 16px",
              background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
              border: "1px solid #fcd34d",
              borderRadius: 10,
              fontSize: "0.83rem",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: "1.15rem", lineHeight: 1, flexShrink: 0 }}>⚠️</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontWeight: 700, color: "#92400e", fontSize: "0.85rem" }}>
                Bu sekmeyi kapatmayın!
              </span>
              <span style={{ color: "#b45309", fontWeight: 500 }}>
                Analiz hızının düşmemesi ve işlemin kesintiye uğramaması için lütfen analiz bitene kadar bu sekmeyi açık ve ön planda tutun.
                Arka planda kalan sekmeler tarayıcı tarafından yavaşlatılır.
              </span>
            </div>
          </div>

          {/* Instagram Kullanım Uyarısı */}
          <div
            style={{
              padding: "10px 16px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 10,
              color: "#c2410c",
              fontSize: "0.82rem",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "1.05rem" }}>📵</span>
            <span style={{ fontWeight: 500 }}>
              İşlem bitene kadar Instagram uygulamasını kullanmayınız.
            </span>
          </div>

          <LiveLogTerminal logs={liveLogs} isActive={anyRunning} />
        </div>
      )}

      {/* ─── İstatistik Kartları ──────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
        <StatCard icon="👥" label="Takipçi" value={profileStats?.followersCount} />
        <StatCard icon="➡️" label="Takip Edilen" value={profileStats?.followingCount} />
        <StatCard icon="🚫" label="Geri Takip Etmeyen" value={visibleNotFollowers.length} accent />
        <StatCard icon="👻" label="Hayalet Takipçi" value={ghostFollowers.length} teal />
        <StatCard icon="🔍" label="Gizli Hayran" value={secretAdmirers.length} teal />
      </div>

      {/* ─── Sekme Butonları ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            { id: "notfollowers" as TabId, label: "Geri Takip Etmeyenler", count: visibleNotFollowers.length },
            { id: "ghost" as TabId, label: "👻 Hayalet Takipçiler", count: ghostFollowers.length + secretAdmirers.length },
            { id: "history" as TabId, label: "📋 Takipten Çıkanlar", count: historyRecords.reduce((acc, r) => acc + r.unfollowers.length, 0) },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          const isHistory = tab.id === "history";
          const isGhost = tab.id === "ghost";
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 18px",
                borderRadius: 999,
                border: `1.5px solid ${
                  isActive
                    ? isHistory ? "#6366f1" : isGhost ? "#0d9488" : "var(--color-pink-4)"
                    : "var(--color-border)"
                }`,
                background: isActive
                  ? isHistory ? "#eef2ff" : isGhost ? "#f0fdfa" : "var(--color-pink-1)"
                  : "var(--color-surface)",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                color: isActive
                  ? isHistory ? "#4338ca" : isGhost ? "#0d9488" : "inherit"
                  : "inherit",
                transition: "all 0.2s ease",
              }}
            >
              {tab.label} ({tab.count.toLocaleString("tr-TR")})
            </button>
          );
        })}

        {/* CSV İndir */}
        {activeTab !== "history" && (
          <button
            type="button"
            onClick={() => {
              if (activeTab === "ghost") {
                handleExport(
                  [...ghostFollowers, ...secretAdmirers],
                  `ghost_${auth?.targetUsername || targetUsername || "export"}`
                );
              } else {
                handleExport(
                  activeList,
                  `${activeTab}_${auth?.targetUsername || targetUsername || "export"}`
                );
              }
            }}
            disabled={activeTab === "ghost" ? (ghostFollowers.length + secretAdmirers.length) === 0 : activeList.length === 0}
            style={{
              marginLeft: "auto",
              padding: "10px 18px",
              borderRadius: 999,
              border: "1.5px solid var(--color-border)",
              background: "var(--color-surface)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              opacity: (activeTab === "ghost" ? (ghostFollowers.length + secretAdmirers.length) === 0 : activeList.length === 0) ? 0.45 : 1,
            }}
          >
            📥 CSV İndir (Excel)
          </button>
        )}
      </div>

      {/* ─── Liste Alanı ─────────────────────────────────────────────────── */}
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 14,
          maxHeight: 400,
          overflowY: "auto",
          background: "var(--color-surface)",
        }}
      >
        {/* Hayalet Takipçiler Sekmesi */}
        {activeTab === "ghost" ? (
          ghostFollowers.length === 0 && secretAdmirers.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", margin: 0 }}>
              Henüz hayalet takipçi analizi yapılmadı. «👻 Hayalet Takipçi Analizi» butonuna tıklayın.
            </p>
          ) : (
            <>
              {ghostFollowers.length > 0 && (
                <div style={{ padding: "10px 16px 4px", background: "#fafafa", borderBottom: "1px solid var(--color-border)" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "0.82rem", color: "#6b7280" }}>
                    👻 Hayalet Takipçiler — Takip ediyor ama son postu beğenmemiş ({ghostFollowers.length.toLocaleString("tr-TR")})
                  </p>
                </div>
              )}
              {ghostFollowers.map((user) => (
                <UserRow key={`ghost-${user.id}`} user={user} />
              ))}

              {secretAdmirers.length > 0 && (
                <div style={{ padding: "10px 16px 4px", background: "#f0fdfa", borderBottom: "1px solid #99f6e4", borderTop: "2px solid #99f6e4" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "0.82rem", color: "#0d9488" }}>
                    🔍 Gizli Hayranlar — Takipçi değil ama son postu beğenmiş ({secretAdmirers.length.toLocaleString("tr-TR")})
                  </p>
                </div>
              )}
              {secretAdmirers.map((user) => (
                <UserRow key={`admirer-${user.id}`} user={user} variant="admirer" />
              ))}
            </>
          )

        /* Takipten Çıkanlar Geçmişi Sekmesi */
        ) : activeTab === "history" ? (
          historyRecords.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p style={{ fontSize: "2rem", margin: "0 0 12px" }}>📭</p>
              <p style={{ color: "var(--color-text-muted)", margin: 0, fontWeight: 500 }}>
                Henüz takipten çıkan kaydı yok.
              </p>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.82rem", margin: "6px 0 0" }}>
                En az 2 analiz yaptıktan sonra karşılaştırma yapılarak burası dolar.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {historyRecords.map((record, idx) => (
                <HistoryGroup
                  key={record.timestamp}
                  record={record}
                  sessionNumber={historyRecords.length - idx}
                />
              ))}
            </div>
          )

        /* Standart Sekmeler */
        ) : (
          activeList.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", margin: 0 }}>
              {lastAnalysisAt
                ? "Bu listede kayıt yok."
                : "Henüz analiz yapılmadı. «Analizi Başlat» butonuna tıklayın."}
            </p>
          ) : (
            activeList.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                // "Yok say" yalnızca GT listesinde anlamlı
                onIgnore={activeTab === "notfollowers" ? ignoreUser : undefined}
              />
            ))
          )
        )}
      </div>

      {/* ─── GT Doğrulama Şeridi ──────────────────────────────────────────── */}
      {activeTab === "notfollowers" && gtMissingCount > 0 && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 14,
            background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
            border: "1px solid #fcd34d",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "1.15rem", lineHeight: 1 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#92400e", fontSize: "0.86rem" }}>
              Bu listede en fazla {gtMissingCount} kayıt hatalı olabilir
            </p>
            <p style={{ margin: "3px 0 0", color: "#b45309", fontSize: "0.82rem", fontWeight: 500 }}>
              {gtMissingCount} kişi takipçi listesinden çekilemedi; aslında geri takip eden birileri
              bu listeye düşmüş olabilir. Doğrulama, her adayı Instagram'a tek tek sorarak kesin sonuç verir.
              {gtVerifyCountdown && " Hesabınızın dinlenmesi için kısa bir süre bekleniyor."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleVerifyGtList}
            disabled={!canVerifyGt}
            style={{
              padding: "11px 20px",
              borderRadius: 999,
              border: "none",
              background: canVerifyGt
                ? "linear-gradient(135deg, #f59e0b, #d97706)"
                : "#e5e7eb",
              color: canVerifyGt ? "#fff" : "#9ca3af",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: canVerifyGt ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
          >
            {isVerifyingGt
              ? "Doğrulanıyor..."
              : gtVerifyCountdown
                ? `Doğrula (${gtVerifyCountdown})`
                : "GT Listesini Doğrula"}
          </button>
        </div>
      )}

      {gtVerifyMessage && (
        <div style={bannerStyle("#ecfdf5", "#a7f3d0", "#047857")}>{gtVerifyMessage}</div>
      )}

      {/* ─── Yok Sayılanlar Penceresi ─────────────────────────────────────── */}
      {activeTab === "notfollowers" && ignoredUsers.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 4px",
            }}
          >
            <span style={{ fontSize: "1rem" }}>🚫</span>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem" }}>
              Yok Sayılanlar ({ignoredUsers.length.toLocaleString("tr-TR")})
            </p>
          </div>
          <div
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 14,
              maxHeight: 240,
              overflowY: "auto",
              background: "#fafafa",
            }}
          >
            {ignoredUsers.map((user) => (
              <UserRow key={`ignored-${user.id}`} user={user} onUnignore={unignoreUser} />
            ))}
          </div>
        </div>
      )}

      {/* Spinner keyframe — globals'e eklemek yerine inline stil tag */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Yardımcı Stiller ─────────────────────────────────────────────────────────

function bannerStyle(bg: string, border: string, color: string): React.CSSProperties {
  return {
    padding: "14px 16px",
    borderRadius: 14,
    background: bg,
    border: `1px solid ${border}`,
    color,
    fontSize: "0.88rem",
  };
}
