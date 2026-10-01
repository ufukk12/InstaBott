/**
 * Takipçi ↔ Takip Edilen Konum Modeli
 * ─────────────────────────────────────────────────────────────────────────────
 * SORU: Takipçi listesinin N. sayfasında veri eksik kaldıysa, kaybolan kişiler
 * takip edilenler listesinin HANGİ bölgesinde duruyor?
 *
 * Eski yaklaşım bunu VARSAYIYORDU (i → i). Ters sıralama varsayımı (i → N−i) da
 * bir varsayım olurdu. Bu modül ikisini de yapmaz: ilişkiyi VERİDEN ÖLÇER.
 *
 * NEDEN DOĞRU POPÜLASYON: Eksik kalan kişiler tanım gereği karşılıklı takipleşenlerdir
 * — `following` içindeler ve hedefi gerçekten takip ediyorlar, sadece takipçi tarafındaki
 * kayıtları çekilemedi. Gözlemleyebildiğimiz karşılıklılar, kayıp olanlarla aynı türden
 * bir örneklem. Dolayısıyla onların konum ilişkisi, kayıp olanlar için geçerli bir tahmindir.
 *
 * MODEL KENDİNİ DEVRE DIŞI BIRAKABİLİR: Örneklem yetersizse veya iki liste arasında
 * anlamlı bir sıra ilişkisi yoksa `usable: false` döner. Bu durumda karantina
 * uygulanmaz — tahmin yerine dürüst belirsizlik tercih edilir.
 *
 * Instagram'a HİÇBİR ek istek atılmaz; her şey bellekteki iki diziden hesaplanır.
 */

import type { IgUser } from "@/lib/instagramApi";
import { toSafeId } from "@/lib/ids";

/** Bir karşılıklı takipleşenin iki listedeki konumu */
export type PositionSample = {
  followerIdx: number;
  followingIdx: number;
};

export type PositionModel = {
  /** Spearman sıra korelasyonu: +1 aynı sıra, −1 ters sıra, 0 ilişki yok */
  rho: number;
  /** Modeli kuran karşılıklı takip sayısı */
  sampleSize: number;
  /** Model güvenilir mi — değilse karantina UYGULANMAZ */
  usable: boolean;
  /** Kullanılabilir/kullanılamaz olma gerekçesi (loglama için) */
  reason: string;
  /** followerIdx'e göre ARTAN sırada örneklemler */
  samples: PositionSample[];
};

// Modelin kurulabilmesi için gereken en az karşılıklı takip sayısı.
// Bunun altında herhangi bir korelasyon istatistiksel gürültüdür.
const MIN_SAMPLE_SIZE = 30;

// |rho| bu eşiğin altındaysa iki liste arasında işe yarar bir sıra ilişkisi yok
// demektir; konumsal tahmin yapmak zar atmakla eşdeğer olur.
const MIN_ABS_RHO = 0.3;

// Bir tahmin penceresi kurmak için o bölgede gereken en az örneklem.
const MIN_LOCAL_SAMPLES = 5;

/** Dizideki her kullanıcının id → index eşlemesi */
function buildIndexMap(users: IgUser[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < users.length; i++) {
    const id = toSafeId(users[i]);
    if (id && !map.has(id)) map.set(id, i);
  }
  return map;
}

/**
 * Spearman sıra korelasyonu.
 * samples followerIdx'e göre ARTAN sırada geldiği için x sıraları doğrudan 0..n-1'dir.
 */
function spearman(samples: PositionSample[]): number {
  const n = samples.length;
  if (n < 2) return 0;

  // followingIdx'e göre sıralayıp her örnekleme y-sırasını ata
  const byFollowing = samples
    .map((s, origin) => ({ followingIdx: s.followingIdx, origin }))
    .sort((a, b) => a.followingIdx - b.followingIdx);

  const yRank = new Array<number>(n);
  for (let rank = 0; rank < n; rank++) {
    yRank[byFollowing[rank].origin] = rank;
  }

  let d2 = 0;
  for (let i = 0; i < n; i++) {
    const d = i - yRank[i];
    d2 += d * d;
  }

  return 1 - (6 * d2) / (n * (n * n - 1));
}

/**
 * İki listeden konum modelini kurar.
 * followers dizisinin sırası korunmalıdır (sayfalama sırası anlam taşır).
 */
export function buildPositionModel(followers: IgUser[], following: IgUser[]): PositionModel {
  const followingIndex = buildIndexMap(following);
  const samples: PositionSample[] = [];

  // followers sırasında ilerle → samples otomatik olarak followerIdx'e göre artan olur
  for (let i = 0; i < followers.length; i++) {
    const id = toSafeId(followers[i]);
    if (!id) continue;
    const followingIdx = followingIndex.get(id);
    if (followingIdx !== undefined) {
      samples.push({ followerIdx: i, followingIdx });
    }
  }

  const sampleSize = samples.length;

  if (sampleSize < MIN_SAMPLE_SIZE) {
    return {
      rho: 0,
      sampleSize,
      usable: false,
      reason: `yetersiz örneklem (${sampleSize} < ${MIN_SAMPLE_SIZE} karşılıklı takip)`,
      samples,
    };
  }

  const rho = spearman(samples);

  if (Math.abs(rho) < MIN_ABS_RHO) {
    return {
      rho,
      sampleSize,
      usable: false,
      reason: `sıra ilişkisi zayıf (|ρ|=${Math.abs(rho).toFixed(3)} < ${MIN_ABS_RHO}) — konumsal tahmin güvenilir değil`,
      samples,
    };
  }

  return {
    rho,
    sampleSize,
    usable: true,
    reason: `ρ=${rho.toFixed(3)}, ${sampleSize} örneklem`,
    samples,
  };
}

export type PredictedWindow = {
  /** Tahmin edilen following aralığı [start, end] — her ikisi de dahil */
  start: number;
  end: number;
  /** Tahminin merkezi — bütçe aşılırsa buna en yakın adaylar seçilir */
  center: number;
  /** Pencereyi kuran yerel örneklem sayısı */
  support: number;
};

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.round((sortedValues.length - 1) * p)));
  return sortedValues[idx];
}

/**
 * Takipçi dizisindeki [followerStart, followerEnd) aralığında eksik veri varsa,
 * bu kişilerin following dizisinde hangi aralıkta olmasının beklendiğini döner.
 *
 * Pencere genişliği SABİT DEĞİL — o bölgedeki gerçek dağılımdan (p10–p90) türetilir.
 * Dağılım genişse pencere de geniş çıkar; bu, bütçe sınırlamasıyla birlikte
 * "ilişki gevşekse az müdahale et" davranışını doğal olarak üretir.
 *
 * Yerel örneklem yetersizse aralık kademeli genişletilir; yine yetmezse null döner.
 */
export function predictFollowingWindow(
  model: PositionModel,
  followerStart: number,
  followerEnd: number
): PredictedWindow | null {
  if (!model.usable) return null;

  let start = followerStart;
  let end = followerEnd;
  const span = Math.max(1, followerEnd - followerStart);

  // En fazla 4 kez genişlet (her seferinde bir sayfa boyu iki yana)
  for (let attempt = 0; attempt <= 4; attempt++) {
    const local = model.samples
      .filter((s) => s.followerIdx >= start && s.followerIdx < end)
      .map((s) => s.followingIdx)
      .sort((a, b) => a - b);

    if (local.length >= MIN_LOCAL_SAMPLES) {
      const p10 = percentile(local, 0.1);
      const p90 = percentile(local, 0.9);
      const median = percentile(local, 0.5);
      return { start: p10, end: p90, center: median, support: local.length };
    }

    start = Math.max(0, start - span);
    end = end + span;
  }

  return null;
}
