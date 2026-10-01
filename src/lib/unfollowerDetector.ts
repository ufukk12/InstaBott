/**
 * unfollowerDetector.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Takipten Çıkanlar (Unfollowers) Dedektör Motoru
 *
 * Algoritma:
 *   1. Init   — email ile IndexedDB aç, eski followers listesini oku
 *   2. Diff   — O(N) Hash Set kıyaslama: eski ∖ yeni = takipten çıkanlar
 *   3. Save   — yeni listeyi üzerine yaz + geçmişe tarih damgalı kayıt
 *   4. Return — UI katmanına sonuç döndür
 *
 * Bağımlılıklar:
 *   • indexedDbManager.ts — multi-tenant IndexedDB CRUD
 *   • instagramApi.ts     — IgUser tipi
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import type { IgUser } from "@/lib/instagramApi";
import {
  initDB,
  getFollowers,
  saveFollowers,
  saveUnfollowersHistory,
  type IgUserRecord,
} from "@/lib/indexedDbManager";
import { toSafeId } from "@/lib/ids";
import { clientLogger } from "@/lib/clientLogger";

// ─── Sonuç Tip Tanımları ──────────────────────────────────────────────────────

export type UnfollowerDetectionResult = {
  /**
   * "first_run"          = ilk analiz, kıyaslama yok
   * "compared"           = kıyaslama yapıldı
   * "skipped_incomplete" = analiz yarıda kesilmiş, yanlış alarmı önlemek için ATLANDI
   */
  status: "first_run" | "compared" | "skipped_incomplete";
  /** Takipten çıkan kullanıcılar listesi (sadece "compared" durumunda dolu) */
  unfollowers: IgUser[];
  /** Yeni takipçi olan kullanıcılar (önceki listede yoktu, şimdi var) */
  newFollowers: IgUser[];
  /** Önceki analizdeki takipçi sayısı */
  previousCount: number;
  /** Şu anki takipçi sayısı */
  currentCount: number;
  /** Net değişim (currentCount - previousCount) */
  netChange: number;
};

// ─── IgUser ↔ IgUserRecord Dönüştürücüler ─────────────────────────────────────

/**
 * IgUser'ı IndexedDB'ye yazılacak formata dönüştürür.
 * toSafeId ile normalize edilmiş id kullanır.
 */
function toRecord(user: IgUser): IgUserRecord | null {
  const id = toSafeId(user);
  if (!id) return null;

  return {
    id,
    username: user.username ?? "",
    full_name: user.full_name ?? "",
    is_private: user.is_private ?? false,
    profile_pic_url: user.profile_pic_url ?? null,
  };
}

/**
 * IgUserRecord'u IgUser'a geri dönüştürür (UI'da kullanılmak üzere).
 */
function toIgUser(record: IgUserRecord): IgUser {
  return {
    id: record.id,
    pk: record.id,
    username: record.username,
    full_name: record.full_name,
    is_private: record.is_private,
    profile_pic_url: record.profile_pic_url ?? undefined,
  } as IgUser;
}

// ─── Ana Dedektör Fonksiyonu ──────────────────────────────────────────────────

/**
 * Unfollower tespiti yapar:
 *   1. email'e ait IndexedDB'den eski takipçi listesini okur
 *   2. Yeni listeyle O(N) Hash Set kıyaslama yapar
 *   3. Yeni listeyi IndexedDB'ye kaydeder (state overwrite)
 *   4. Takipten çıkanları geçmişe tarih damgasıyla kaydeder
 *
 * @param email        - Oturum açmış kullanıcının e-postası
 * @param newFollowers - API'den yeni çekilen taze takipçi listesi
 * @returns Tespit sonucu (ilk analiz mi, takipten çıkanlar, yeni gelen takipçiler, vs.)
 */
export async function detectUnfollowers(
  email: string,
  newFollowers: IgUser[],
  options: { analysisComplete?: boolean } = {}
): Promise<UnfollowerDetectionResult> {
  // ─── EMNİYET KAPISI: Eksik veriyle kıyaslama YAPILMAZ ──────────────────
  // Yarıda kesilmiş bir taramanın takipçi listesi eksiktir. Onu önceki tam listeyle
  // kıyaslamak, sadece ÇEKİLEMEYEN kişileri "takipten çıktı" diye raporlar —
  // kullanıcıya tamamen yanlış alarm gönderilir. `analysisComplete` bayrağı
  // instagramClient tarafından yazılır ve loadStoredAnalysis tarafından okunur.
  if (options.analysisComplete === false) {
    clientLogger.warn(
      "unfollower",
      "Analiz eksik (analysisComplete=false) — takipten çıkan tespiti ATLANDI, yanlış alarm önlendi"
    );
    return {
      status: "skipped_incomplete",
      unfollowers: [],
      newFollowers: [],
      previousCount: 0,
      currentCount: newFollowers.length,
      netChange: 0,
    };
  }

  // ─── Adım 1: Başlatma ve Eski Veriyi Okuma ────────────────────────────
  await initDB(email);
  const oldRecords = await getFollowers(email);

  // Yeni takipçileri IndexedDB formatına dönüştür (geçersiz ID'leri filtrele)
  const newRecords: IgUserRecord[] = [];
  for (const user of newFollowers) {
    const rec = toRecord(user);
    if (rec) newRecords.push(rec);
  }

  // ─── KONTROL: İlk analiz mi? ─────────────────────────────────────────
  if (!oldRecords || oldRecords.length === 0) {
    // İlk analiz — kıyaslama yapılamaz, sadece kaydet
    clientLogger.audit(
      "unfollower",
      `İlk analiz: ${newRecords.length} takipçi kaydediliyor (kıyaslama yok)`,
      { takipci: newRecords.length }
    );

    await saveFollowers(email, newRecords);

    return {
      status: "first_run",
      unfollowers: [],
      newFollowers: [],
      previousCount: 0,
      currentCount: newRecords.length,
      netChange: newRecords.length,
    };
  }

  // ─── Adım 3: O(N) Hash Set Kıyaslama ─────────────────────────────────

  // Yeni takipçilerin ID'lerini Set'e at → O(1) arama
  const newIdSet = new Set<string>(newRecords.map((r) => r.id));

  // Eski takipçilerin ID'lerini Set'e at → yeni takipçi tespiti için
  const oldIdSet = new Set<string>(oldRecords.map((r) => r.id));

  // Takipten çıkanlar: eski listede var, yeni listede yok
  const unfollowerRecords: IgUserRecord[] = [];
  for (const oldUser of oldRecords) {
    if (!newIdSet.has(oldUser.id)) {
      unfollowerRecords.push(oldUser);
    }
  }

  // Yeni gelen takipçiler: yeni listede var, eski listede yok
  const newFollowerRecords: IgUserRecord[] = [];
  for (const newUser of newRecords) {
    if (!oldIdSet.has(newUser.id)) {
      newFollowerRecords.push(newUser);
    }
  }

  // IgUser formatına dönüştür (UI'da kullanılmak üzere)
  const unfollowers = unfollowerRecords.map(toIgUser);
  const justFollowed = newFollowerRecords.map(toIgUser);

  clientLogger.audit(
    "unfollower",
    `Kıyaslama tamamlandı: ${unfollowers.length} takipten çıkan, ` +
      `${justFollowed.length} yeni takipçi (${oldRecords.length} → ${newRecords.length})`,
    { takiptenCikan: unfollowers.length, yeniTakipci: justFollowed.length }
  );

  // ─── Adım 4: Durumu Güncelle ─────────────────────────────────────────

  // Yeni listeyi IndexedDB'ye üzerine yaz
  await saveFollowers(email, newRecords);

  // Takipten çıkanları geçmişe kaydet (sadece varsa)
  if (unfollowerRecords.length > 0) {
    await saveUnfollowersHistory(email, unfollowerRecords, {
      followersCountBefore: oldRecords.length,
      followersCountAfter: newRecords.length,
    });
  }

  return {
    status: "compared",
    unfollowers,
    newFollowers: justFollowed,
    previousCount: oldRecords.length,
    currentCount: newRecords.length,
    netChange: newRecords.length - oldRecords.length,
  };
}
