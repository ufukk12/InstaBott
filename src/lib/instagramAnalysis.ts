// Aşama 1 — Hash Map Karşılaştırma Modülü (Pure Functions)
// Kurallar:
//   • Set.has() ile O(1) arama — includes() ve iç içe döngü YASAK
//   • Tüm ID'ler String(pk || id) formatında

import type { IgUser } from "@/lib/instagramApi";
import { toSafeId, type IdCarrier } from "@/lib/ids";
import { clientLogger, clientErrorMeta } from "@/lib/clientLogger";

// DRY: toUserId artık ids.ts'den geliyor (re-export ile geriye uyumluluk)
export const toUserId = toSafeId;
export type { IdCarrier };

/** Kullanıcı kaydını normalize eder */
export function normalizeUserRecord(user: IgUser): IgUser | null {
  const id = toUserId(user);
  if (!id) return null;
  return { ...user, id };
}

export function normalizeUserList(users: IgUser[]): IgUser[] {
  const result: IgUser[] = [];
  for (const user of users) {
    const normalized = normalizeUserRecord(user);
    if (normalized) result.push(normalized);
  }
  return result;
}

/** O(N) — ID'leri Set'e aktarır (Hash Map) */
export function buildIdSet(users: IgUser[]): Set<string> {
  const ids = new Set<string>();
  for (const user of users) {
    const id = toUserId(user);
    if (id) ids.add(id);
  }
  return ids;
}

/** Pagination duplikatlarını Map ile temizler, ID'leri string'e zorlayarak normalize eder ve birden fazla listeyi spread olmadan birleştirir (O(N)) */
export function deduplicateUsers(...lists: IgUser[][]): IgUser[] {
  const map = new Map<string, IgUser>();
  for (const list of lists) {
    for (const user of list) {
      const id = toUserId(user);
      if (id && !map.has(id)) {
        map.set(id, { ...user, id }); // Hem normalize eder hem de benzersiz kılar
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Notfollowers — Geri takip etmeyenler
 * following listesini dön; ID followers Set'inde YOKSA ekle
 */
export function computeNotFollowers(
  followers: IgUser[],
  following: IgUser[],
  quarantineIds?: Set<string>
): IgUser[] {
  const followerIds = buildIdSet(followers);
  const result: IgUser[] = [];

  for (const user of following) {
    const id = toUserId(user);
    if (id && !followerIds.has(id)) {
      // Karantina kontrolü: Eksik veri bölgesindeki kullanıcıları atla (yalancı pozitif)
      if (quarantineIds && quarantineIds.has(id)) {
        continue;
      }
      result.push(user);
    }
  }

  return result;
}

/**
 * Unfollowing — Sizin takip etmedikleriniz
 * followers listesini dön; ID following Set'inde YOKSA ekle
 */
export function computeUnfollowing(followers: IgUser[], following: IgUser[]): IgUser[] {
  const followingIds = buildIdSet(following);
  const result: IgUser[] = [];

  for (const user of followers) {
    const id = toUserId(user);
    if (id && !followingIds.has(id)) {
      result.push(user);
    }
  }

  return result;
}

export type AnalysisResult = {
  followers: IgUser[];
  following: IgUser[];
  notFollowers: IgUser[];
  unfollowing: IgUser[];
  stats: {
    dedupFollowers: number;
    dedupFollowing: number;
    mutualCount: number;
  };
};

/** Tam analiz orkestratörü — yan etkisiz */
export function runFullAnalysis(
  rawFollowers: IgUser[],
  rawFollowing: IgUser[],
  { silent = false, quarantineIds }: { silent?: boolean; quarantineIds?: Set<string> } = {}
): AnalysisResult {
  const followers = deduplicateUsers(rawFollowers);
  const following = deduplicateUsers(rawFollowing);

  const notFollowers = computeNotFollowers(followers, following, quarantineIds);
  const unfollowing = computeUnfollowing(followers, following);

  // DÜZELTME: Eskiden `following.length - notFollowers.length` ile hesaplanıyordu.
  // Karantina notFollowers'ı küçülttüğü için bu formül, karantinaya alınan
  // (ve gerçekte takip ETMEYEN) kişileri "karşılıklı" sayıp istatistiği şişiriyordu.
  // Artık gerçek kesişim sayılıyor — karantinadan bağımsız olarak doğru.
  const followerIdSet = buildIdSet(followers);
  let mutualCount = 0;
  for (const user of following) {
    const id = toUserId(user);
    if (id && followerIdSet.has(id)) mutualCount++;
  }

  if (!silent) {
    const quarantineInfo = quarantineIds && quarantineIds.size > 0
      ? ` | Karantina havuzu: ${quarantineIds.size} kişi`
      : '';
    clientLogger.audit(
      "analiz",
      `Karşılaştırma tamamlandı — Takipçi: ${followers.length} | Takip: ${following.length} | ` +
        `GT yapmayan: ${notFollowers.length} | Takipten çıkılabilir: ${unfollowing.length} | ` +
        `Karşılıklı: ${mutualCount}${quarantineInfo}`,
      {
        hamTakipci: rawFollowers.length,
        takipci: followers.length,
        takip: following.length,
        gtYapmayan: notFollowers.length,
        karsilikli: mutualCount,
        karantinaHavuzu: quarantineIds?.size ?? 0,
      }
    );
  }

  return {
    followers,
    following,
    notFollowers,
    unfollowing,
    stats: {
      dedupFollowers: followers.length,
      dedupFollowing: following.length,
      mutualCount,
    },
  };
}

// ─── Hayalet Takipçi (Ghost Followers) Analiz Fonksiyonları ───────────────────

export type GhostAnalysisResult = {
  ghostFollowers: IgUser[];  // Grup A: Takipçi ama postu beğenmemiş
  secretAdmirers: IgUser[];  // Grup B: Takipçi değil ama postu beğenmiş
  stats: {
    totalFollowers: number;
    totalLikers: number;
    ghostCount: number;
    admirerCount: number;
  };
};

/**
 * Grup A — Hayalet Takipçiler
 * followers listesinde olup likers listesinde OLMAYANLAR
 * (Takip ediyor ama son postu beğenmemiş)
 */
export function computeGhostFollowers(followers: IgUser[], likers: IgUser[]): IgUser[] {
  const likerIds = buildIdSet(likers);
  const result: IgUser[] = [];

  for (const user of followers) {
    const id = toUserId(user);
    if (id && !likerIds.has(id)) {
      result.push(user);
    }
  }

  return result;
}

/**
 * Grup B — Gizli Hayranlar / Stalkerlar
 * likers listesinde olup followers listesinde OLMAYANLAR
 * (Takip etmediği halde postu beğenmiş)
 */
export function computeSecretAdmirers(followers: IgUser[], likers: IgUser[]): IgUser[] {
  const followerIds = buildIdSet(followers);
  const result: IgUser[] = [];

  for (const user of likers) {
    const id = toUserId(user);
    if (id && !followerIds.has(id)) {
      result.push(user);
    }
  }

  return result;
}

/**
 * Ghost Followers tam analiz orkestratörü — yan etkisiz, O(N)
 */
export function runGhostAnalysis(
  rawFollowers: IgUser[],
  rawLikers: IgUser[],
  { silent = false }: { silent?: boolean } = {}
): GhostAnalysisResult {
  const followers = deduplicateUsers(rawFollowers);
  const likers = deduplicateUsers(rawLikers);

  const ghostFollowers = computeGhostFollowers(followers, likers);
  const secretAdmirers = computeSecretAdmirers(followers, likers);

  if (!silent) {
    clientLogger.audit(
      "ghost-analiz",
      `Hayalet analizi tamamlandı — Takipçi: ${followers.length} | Beğenen: ${likers.length} | ` +
        `Hayalet: ${ghostFollowers.length} | Gizli hayran: ${secretAdmirers.length}`,
      { takipci: followers.length, begenen: likers.length, hayalet: ghostFollowers.length }
    );
  }

  return {
    ghostFollowers,
    secretAdmirers,
    stats: {
      totalFollowers: followers.length,
      totalLikers: likers.length,
      ghostCount: ghostFollowers.length,
      admirerCount: secretAdmirers.length,
    },
  };
}
