// Instagram API istekleri için ortak yardımcılar
// ig_follow_compare.py dosyasındaki mantığa birebir sadık kalınmıştır.
// ÖNEMLİ: Mobil API (i.instagram.com) kullanılır — web API'ye göre
// sessionid doğrulaması çok daha güvenilirdir ve HTTP 400 vermez.

import { toSafeId } from "@/lib/ids";
import { logger, errorMeta } from "@/lib/logger";
import {
  IG_APP_ID,
  IG_BASE,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  NETWORK_RETRY_MAX,
  NETWORK_RETRY_DELAY_MS,
} from "@/lib/instagramConstants";

// Sabitler tarayıcı-güvenli modülde tutuluyor (bkz. instagramConstants.ts).
// Bu dosya sunucu tarafı logger'ı (fs) import ettiği için, istemcinin doğrudan buradan
// sabit çekmesi tüm client paketine `fs` bağımlılığı sızdırıyordu.
// Re-export korunuyor ki mevcut sunucu tarafı import'ları aynen çalışsın.
export {
  IG_APP_ID,
  IG_BASE,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  NETWORK_RETRY_MAX,
  NETWORK_RETRY_DELAY_MS,
  MAX_SERVER_REQUEST_DURATION_MS,
} from "@/lib/instagramConstants";

// Precision Loss koruması: 15+ haneli sayıları string'e çeviren regex
// Modül yüklenirken bir kez derlenir, her API çağrısında yeniden oluşturulmaz
const SAFE_BIGINT_RE = /"([^"]+)":\s*(-?\d{15,})/g;

// NOT: REQUEST_TIMEOUT_MS, NETWORK_RETRY_*, MAX_SERVER_REQUEST_DURATION_MS ve PAGE_SIZE
// artık instagramConstants.ts içinde tanımlı (yukarıda import + re-export ediliyor).

// Python'daki build_headers fonksiyonunun birebir karşılığı.
// Mobil istemciyi taklit ediyoruz çünkü sadece bu şekilde
// sessionid ile kimlik doğrulaması sorunsuz geçerli oluyor.
const MOBILE_USER_AGENT = "Instagram 314.0.0.28.113 Android (33/13; 480dpi; 1080x2340; samsung; SM-S918B; q2q; qcom; en_US; 558051283)";

/**
 * Kullanıcının yapıştırdığı session değerini temizler.
 * Desteklenen formatlar:
 *   - Ham sessionid değeri
 *   - sessionid=...; Path=/; ...
 *   - URL-encoded (%3A ile ayrılmış) değerler
 */
export function sanitizeSessionId(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let id = raw.trim();

  if (
    (id.startsWith('"') && id.endsWith('"')) ||
    (id.startsWith("'") && id.endsWith("'"))
  ) {
    id = id.slice(1, -1).trim();
  }

  const cookieMatch = id.match(/(?:^|;\s*)sessionid=([^;\s]+)/i);
  if (cookieMatch) {
    id = cookieMatch[1];
  } else if (/^sessionid=/i.test(id)) {
    id = id.replace(/^sessionid=/i, "");
  }

  id = id.split(";")[0].trim();

  if (id.includes("%")) {
    try {
      id = decodeURIComponent(id);
    } catch {
      /* decode edilemezse ham değeri kullan */
    }
  }

  return id.length > 0 ? id : null;
}

/**
 * Python'daki build_headers fonksiyonunun TypeScript karşılığı.
 * Mobil User-Agent + sessionid cookie + X-IG-App-ID
 */
// Session'dan bağımsız sabit header'lar — modül yüklenirken bir kez oluşturulur
const STATIC_HEADERS: Record<string, string> = {
  "User-Agent": MOBILE_USER_AGENT,
  "X-IG-App-ID": IG_APP_ID,
  "Accept-Language": "en-US",
  "Accept": "*/*",
  "Connection": "keep-alive",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

export function buildInstagramHeaders(sessionId: string): HeadersInit {
  return { ...STATIC_HEADERS, "Cookie": `sessionid=${sessionId}` };
}

// ─── Tip Tanımları ────────────────────────────────────────────────────────────

export type IgUser = {
  id: string;
  username: string;
  full_name: string;
  is_private: boolean;
  profile_pic_url: string | null;
};

export type WebProfileResult =
  | {
      ok: true;
      userId: string;
      username: string;
      fullName: string;
      followersCount: number;
      followingCount: number;
      profilePicUrl: string | null;
    }
  | { ok: false; reason: IgErrorReason; status?: number; retryAfter: number | null };

export type FriendshipPageResult =
  | { ok: true; users: IgUser[]; nextMaxId: string | null }
  | { ok: false; reason: IgErrorReason; status?: number; retryAfter: number | null };

export type LatestMediaResult =
  | { ok: true; mediaId: string; mediaCount: number }
  | { ok: false; reason: IgErrorReason | "NO_POSTS"; status?: number; retryAfter: number | null };

export type LikersPageResult =
  | { ok: true; users: IgUser[]; nextMaxId: string | null }
  | { ok: false; reason: IgErrorReason; status?: number; retryAfter: number | null };

// Tüm API fonksiyonlarının ortak hata tipi
export type IgErrorReason = "INVALID_SESSION" | "NOT_FOUND" | "RATE_LIMIT" | "NETWORK" | "JSON_PARSE_ERROR" | "UNKNOWN";

// ─── DRY: toIgUserId re-export (geriye uyumluluk) ────────────────────────────

/** API kullanıcı nesnesinden precision-safe string ID üretir */
export const toIgUserId = toSafeId;

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────

function normalizeIgUser(raw: {
  pk?: string | number;
  id?: string | number;
  username?: string;
  full_name?: string;
  is_private?: boolean;
  profile_pic_url?: string | null;
}): IgUser | null {
  const id = toSafeId(raw);
  if (!id || !raw.username) return null;
  return {
    id,
    username: raw.username,
    full_name: raw.full_name ?? "",
    is_private: raw.is_private ?? false,
    profile_pic_url: raw.profile_pic_url ?? null,
  };
}

/** Ham users dizisini normalize eder */
function normalizeIgUserList(rawUsers: unknown[]): IgUser[] {
  const users: IgUser[] = [];
  for (const raw of rawUsers) {
    const normalized = normalizeIgUser(raw as Parameters<typeof normalizeIgUser>[0]);
    if (normalized) users.push(normalized);
  }
  return users;
}

/**
 * Instagram'ın HIZ SINIRI yanıtlarını tanıyan kalıplar.
 *
 * Instagram throttle ederken oturumu geçersiz kılmaz — sadece "biraz bekle" der.
 * Ama bunu `{"status":"fail","message":"Please wait a few minutes..."}` biçiminde
 * döndürdüğü için, sadece `status === "fail"` bakan eski kontrol bunu OTURUM ÖLÜMÜ
 * sanıyordu. Sonuç: 401 döndürülüyor, istemci akıllı cooldown'a hiç girmiyor ve
 * geri çekilmeden aynı imleçleri dövmeye devam ederek throttle'ı derinleştiriyordu.
 */
const IG_THROTTLE_RE =
  /wait a few (?:minutes|moments)|try again later|please wait|rate.?limit|too many requests|action.?block/i;

/** Gövdedeki sinyale göre yanıtın ne anlama geldiğini söyler. */
export type IgBodyVerdict = "OK" | "SESSION_DEAD" | "THROTTLED";

export function classifyIgBody(data: unknown): IgBodyVerdict {
  if (!data || typeof data !== "object") return "SESSION_DEAD";

  const body = data as Record<string, unknown>;
  const msg = typeof body.message === "string" ? body.message : "";

  // 1. KESİN oturum ölümü sinyalleri — bunlar throttle'dan önce değerlendirilir
  if (body.require_login === true) return "SESSION_DEAD";
  if (/login_required|checkpoint/i.test(msg)) return "SESSION_DEAD";

  // 2. THROTTLE — oturum SAĞLAM, sadece beklemek gerekiyor
  if (IG_THROTTLE_RE.test(msg)) return "THROTTLED";
  if (body.spam === true) return "THROTTLED";
  if (body.feedback_required === true) return "THROTTLED";

  // 3. Tanımlanamayan status:"fail" → temkinli davran, ESKİ davranışı koru
  if (body.status === "fail") return "SESSION_DEAD";

  // 4. Eski regex'in kalan kapsamı
  if (/login|session/i.test(msg)) return "SESSION_DEAD";

  return "OK";
}

/** Log'a yazmak için Instagram'ın kendi mesajını güvenle çıkarır. */
export function extractIgMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "(gövde yok)";
  const body = data as Record<string, unknown>;
  const msg = typeof body.message === "string" ? body.message : "";
  const status = typeof body.status === "string" ? body.status : "";
  return `${status ? `status=${status} ` : ""}${msg || "(mesaj yok)"}`.slice(0, 300);
}

/**
 * Bir Instagram yanıt gövdesinin "oturum geçersiz" sinyali taşıyıp taşımadığını söyler.
 * Ham fetch yapan route'lar (ör. check-watcher) bunu kullanır — tanım tek yerde kalsın.
 * Artık throttle yanıtlarını oturum ölümü SAYMAZ.
 */
export function isLoginRequired(data: unknown): boolean {
  return classifyIgBody(data) === "SESSION_DEAD";
}

// ─── igRequest: Ortak HTTP + JSON Parse + Statüs Kontrolü ────────────────────
// Aşama 1 (DRY) + Aşama 2 (Timeout + Retry-After) + Aşama 3 (JSON_PARSE_ERROR ayrıştırma)
// 4 API fonksiyonundaki ~140 satır tekrarı bu tek helper'a indirger.

type IgRequestOk = { ok: true; data: unknown; status: number; retryAfter: number | null };
type IgRequestFail = { ok: false; reason: IgErrorReason; status?: number; retryAfter: number | null };
type IgRequestResult = IgRequestOk | IgRequestFail;

async function igRequest(url: string, sessionId: string): Promise<IgRequestResult> {
  // Geçici ağ hatalarında otomatik retry (NETWORK_RETRY_MAX kez)
  for (let attempt = 0; attempt <= NETWORK_RETRY_MAX; attempt++) {
    if (attempt > 0) {
      // Kısa bekleme: 1s, 2s...
      await new Promise((r) => setTimeout(r, NETWORK_RETRY_DELAY_MS * attempt));
      logger.warn("ig:request", `Ağ hatası sonrası yeniden deneniyor (${attempt}/${NETWORK_RETRY_MAX})`, { url });
    }

    // AbortController ile 18s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: buildInstagramHeaders(sessionId),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt < NETWORK_RETRY_MAX) continue; // Retry
      logger.error("ig:request", "Ağ/timeout hatası — tüm denemeler tükendi", { url, ...errorMeta(error) });
      return { ok: false, reason: "NETWORK", retryAfter: null };
    } finally {
      clearTimeout(timeoutId);
    }

    // Retry-After header'ını oku
    const retryAfterRaw = response.headers.get("Retry-After");
    const retryAfter = retryAfterRaw ? Math.min(parseInt(retryAfterRaw, 10) || 0, 120) : null;

    // HTTP statüs kontrolleri
    if (response.status === 429) {
      return { ok: false, reason: "RATE_LIMIT", status: 429, retryAfter };
    }

    if (response.status === 404) {
      return { ok: false, reason: "NOT_FOUND", status: 404, retryAfter: null };
    }

    if (
      response.status === 401 ||
      response.status === 403 ||
      (response.status >= 300 && response.status < 400)
    ) {
      // HTTP seviyesinde reddedildi — gövde okunmadan kesin oturum ölümü sayılır.
      // Gövde kaynaklı (status:"fail") vakalardan ayırt edilebilsin diye ayrıca loglanıyor.
      logger.warn("ig:request", "Oturum HTTP seviyesinde reddedildi", {
        url,
        status: response.status,
      });
      return { ok: false, reason: "INVALID_SESSION", status: response.status, retryAfter: null };
    }

    // Safe JSON parse — JSON_PARSE_ERROR, INVALID_SESSION ile karışmaz
    let data: unknown;
    try {
      const rawText = await response.text();
      const safeJsonText = rawText.replace(SAFE_BIGINT_RE, '"$1":"$2"');
      data = JSON.parse(safeJsonText);
    } catch {
      // JSON_PARSE_ERROR geçici olabilir — retry et
      if (attempt < NETWORK_RETRY_MAX) continue;
      return { ok: false, reason: "JSON_PARSE_ERROR", status: response.status, retryAfter: null };
    }

    // Gövde sinyalini sınıflandır — throttle ile oturum ölümü artık ayrı yollar
    const verdict = classifyIgBody(data);

    if (verdict === "THROTTLED") {
      // KRİTİK: RATE_LIMIT olarak dönmek, istemcinin runSmartCooldown'a girip geri
      // çekilmesini sağlar. Eskiden INVALID_SESSION dönüyordu ve istemci hiç beklemeden
      // devam edip throttle'ı derinleştiriyordu.
      logger.warn("ig:request", "Instagram hız sınırı (gövde sinyali)", {
        url,
        status: response.status,
        igMessage: extractIgMessage(data),
      });
      return { ok: false, reason: "RATE_LIMIT", status: response.status, retryAfter };
    }

    if (!response.ok || verdict === "SESSION_DEAD") {
      // TEŞHİS: Instagram'ın kendi mesajı loglanıyor. Bu olmadan "oturum gerçekten mi
      // öldü yoksa yanlış mı sınıflandırdık" sorusunu tahminle cevaplamak zorunda kalıyorduk.
      logger.warn("ig:request", "Oturum geçersiz sayıldı", {
        url,
        status: response.status,
        igMessage: extractIgMessage(data),
      });
      return { ok: false, reason: "INVALID_SESSION", status: response.status, retryAfter: null };
    }

    return { ok: true, data, status: response.status, retryAfter };
  }

  // Bu noktaya ulaşılmamalı (for döngüsü her durumda return ediyor)
  return { ok: false, reason: "NETWORK", retryAfter: null };
}

// ─── API Fonksiyonları (igRequest ile sadeleştirilmiş) ────────────────────────

/**
 * Python'daki get_user_id fonksiyonunun birebir karşılığı.
 * usernameinfo endpoint'i ile kullanıcı adından numeric user_id çözer.
 */
export async function fetchUserInfo(
  username: string,
  sessionId: string
): Promise<WebProfileResult> {
  const url = `${IG_BASE}/users/${encodeURIComponent(username)}/usernameinfo/`;
  const result = await igRequest(url, sessionId);

  if (!result.ok) {
    return { ok: false, reason: result.reason, status: result.status, retryAfter: result.retryAfter };
  }

  const user = (result.data as {
    user?: {
      pk?: string | number;
      username?: string;
      full_name?: string;
      profile_pic_url?: string | null;
      follower_count?: number;
      following_count?: number;
    };
  })?.user;

  if (!user?.pk) {
    return { ok: false, reason: "INVALID_SESSION", status: result.status, retryAfter: null };
  }

  return {
    ok: true,
    userId: String(user.pk),
    username: user.username ?? username,
    fullName: user.full_name ?? "",
    followersCount: user.follower_count ?? 0,
    followingCount: user.following_count ?? 0,
    profilePicUrl: user.profile_pic_url ?? null,
  };
}

/**
 * Takipçi/takip edilen listesinin TEK sayfasını doğrudan Instagram Mobil API'sinden çeker.
 * Client-side orkestratör (instagramClient.ts) sayfalamayı yönetir.
 */
export async function fetchFriendshipPage(
  userId: string,
  sessionId: string,
  type: "followers" | "following",
  maxId: string | null = null,
  count: number = PAGE_SIZE
): Promise<FriendshipPageResult> {
  const base = `${IG_BASE}/friendships/${userId}/${type}/?count=${count}`;
  const url = maxId ? `${base}&max_id=${encodeURIComponent(maxId)}` : base;
  const result = await igRequest(url, sessionId);

  if (!result.ok) {
    return { ok: false, reason: result.reason, status: result.status, retryAfter: result.retryAfter };
  }

  const rawUsers = (result.data as { users?: unknown[] }).users ?? [];
  const users = normalizeIgUserList(rawUsers);
  const nextRaw = (result.data as { next_max_id?: string | number | null }).next_max_id;

  return {
    ok: true,
    users,
    nextMaxId: nextRaw != null ? String(nextRaw) : null,
  };
}

// ─── Takipçi Doğrulama (GT Listesi Kesin Düzeltmesi) ─────────────────────────

export type FollowerSearchResult =
  | { ok: true; isFollower: boolean; matched: IgUser | null }
  | { ok: false; reason: IgErrorReason; status?: number; retryAfter: number | null };

/**
 * Belirli bir kullanıcının hedefin TAKİPÇİSİ olup olmadığını kesin olarak sorar.
 *
 * Hedefin takipçi listesi içinde arama yapar — `friendships/show` gibi oturum sahibinin
 * kendi ilişkisini değil, HEDEFİN ilişkisini döner. Gözcü hesap ile hedef hesap farklı
 * olduğunda da çalışmasının sebebi budur.
 *
 * FAIL-SAFE TASARIM: Yalnızca POZİTİF eşleşme anlamlıdır.
 *   • Eşleşme bulundu  → kişi kesinlikle takipçidir (GT listesinden çıkarılabilir)
 *   • Bulunamadı       → SONUÇSUZ sayılır, kişi listede BIRAKILIR
 * Böylece uç nokta `query` parametresini yok sayarsa ya da beklenmedik yanıt dönerse
 * sistem "düzeltme yapamadım" der; asla yanlış kişiyi listeden çıkarmaz.
 */
export async function searchFollowerByUsername(
  userId: string,
  sessionId: string,
  username: string,
  expectedId?: string
): Promise<FollowerSearchResult> {
  const url =
    `${IG_BASE}/friendships/${userId}/followers/` +
    `?count=20&query=${encodeURIComponent(username)}&search_surface=follow_list_page`;

  const result = await igRequest(url, sessionId);

  if (!result.ok) {
    return { ok: false, reason: result.reason, status: result.status, retryAfter: result.retryAfter };
  }

  const rawUsers = (result.data as { users?: unknown[] }).users ?? [];
  const users = normalizeIgUserList(rawUsers);

  const target = username.toLowerCase();
  const matched =
    users.find((u) => (expectedId && u.id === expectedId) || u.username.toLowerCase() === target) ?? null;

  return { ok: true, isFollower: matched !== null, matched };
}

// ─── Hayalet Takipçi (Ghost Followers) API Fonksiyonları ──────────────────────

/**
 * Hedef kullanıcının son paylaştığı postun media_id bilgisini çeker.
 * Endpoint: GET /api/v1/feed/user/{userId}/?count=1
 */
export async function fetchLatestMedia(
  userId: string,
  sessionId: string
): Promise<LatestMediaResult> {
  const url = `${IG_BASE}/feed/user/${userId}/?count=1`;
  const result = await igRequest(url, sessionId);

  if (!result.ok) {
    return { ok: false, reason: result.reason, status: result.status, retryAfter: result.retryAfter };
  }

  const body = result.data as { num_results?: number; items?: Array<{ pk?: string | number; id?: string | number }> };
  const mediaCount = body.num_results ?? body.items?.length ?? 0;

  if (mediaCount === 0 || !body.items || body.items.length === 0) {
    return { ok: false, reason: "NO_POSTS", retryAfter: null };
  }

  const firstItem = body.items[0];
  const mediaId = String(firstItem.pk || firstItem.id || "");
  if (!mediaId) {
    return { ok: false, reason: "NO_POSTS", retryAfter: null };
  }

  return { ok: true, mediaId, mediaCount };
}

/**
 * Belirtilen postun beğenenlerinin TEK sayfasını çeker.
 * Endpoint: GET /api/v1/media/{mediaId}/likers/
 */
export async function fetchMediaLikersPage(
  mediaId: string,
  sessionId: string,
  maxId: string | null = null
): Promise<LikersPageResult> {
  let url = `${IG_BASE}/media/${mediaId}/likers/`;
  if (maxId) url += `?max_id=${encodeURIComponent(maxId)}`;
  const result = await igRequest(url, sessionId);

  if (!result.ok) {
    return { ok: false, reason: result.reason, status: result.status, retryAfter: result.retryAfter };
  }

  const rawUsers = (result.data as { users?: unknown[] }).users ?? [];
  const users = normalizeIgUserList(rawUsers);
  const nextRaw = (result.data as { next_max_id?: string | number | null }).next_max_id;

  return {
    ok: true,
    users,
    nextMaxId: nextRaw != null ? String(nextRaw) : null,
  };
}
