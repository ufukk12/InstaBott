// ─── Ortak ID Yardımcıları ────────────────────────────────────────────────────
// instagramApi.ts (toIgUserId) ve instagramAnalysis.ts (toUserId) aynı
// fonksiyonu tekrarlıyordu. Tek kaynak (Single Source of Truth) burası.

export type IdCarrier = { pk?: string | number; id?: string | number };

/** Precision-loss koruması: pk veya id'yi her zaman string'e zorlar */
export function toSafeId(user: IdCarrier): string {
  const raw = user.pk || user.id;
  return raw != null && raw !== "" ? String(raw) : "";
}
