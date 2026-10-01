/**
 * indexedDbManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Çoklu Kullanıcı (Multi-Tenant) IndexedDB Yönetim Servisi
 *
 * Her kullanıcının verisi kendi ayrı IndexedDB veritabanında tutulur.
 * Veritabanı adı, kullanıcının e-postasından türetilir:
 *   "test.user@gmail.com"  →  "InstagramAnalyzer_test_user_gmail_com"
 *
 * Mimari:
 *   • Email Sanitization   — özel karakterleri alt çizgiye çevir
 *   • Singleton Cache      — aynı email için bağlantıyı yeniden açmaz
 *   • Schema Management    — onupgradeneeded ile Object Store kurulumu
 *   • Promise-Based CRUD   — async/await uyumlu sarmalayıcılar
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { clientLogger } from "@/lib/clientLogger";

// ─── Tip Tanımları ────────────────────────────────────────────────────────────

export interface IgUserRecord {
  id: string;
  username: string;
  full_name: string;
  is_private: boolean;
  profile_pic_url: string | null;
  [key: string]: unknown; // Gelecekte eklenecek alanlar için genişletilebilir
}

export interface UnfollowerHistoryRecord {
  timestamp: number;        // keyPath — ISO ms cinsinden zaman damgası
  unfollowers: IgUserRecord[];
  followersCountBefore: number;
  followersCountAfter: number;
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const DB_PREFIX = "InstagramAnalyzer";
const DB_VERSION = 1;

/** Object Store isimleri — tek noktadan yönetilir */
const STORES = {
  FOLLOWERS: "followers",
  FOLLOWING: "following",
  UNFOLLOWERS_HISTORY: "unfollowers_history",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

// ─── Singleton Bağlantı Cache ─────────────────────────────────────────────────
// Her email için yalnızca bir IDBDatabase örneği açık tutulur.
// Aynı email'e tekrar initDB çağrılırsa yeni bağlantı açılmaz.

const connectionCache = new Map<string, IDBDatabase>();

// ─── Email Sanitization ───────────────────────────────────────────────────────

/**
 * Kullanıcı e-postasını güvenli bir IndexedDB veritabanı adına dönüştürür.
 *
 * @example
 * sanitizeEmail("test.user@gmail.com")
 * // → "InstagramAnalyzer_test_user_gmail_com"
 */
export function sanitizeEmail(email: string): string {
  // Küçük harfe çevir, harf/rakam dışındaki her karakteri '_' yap
  const safe = email
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    // Ardışık alt çizgileri tek alt çizgiye indir
    .replace(/_+/g, "_")
    // Baştaki/sondaki alt çizgileri kaldır
    .replace(/^_|_$/g, "");

  return `${DB_PREFIX}_${safe}`;
}

// ─── Şema Kurulumu ────────────────────────────────────────────────────────────

/**
 * onupgradeneeded tetiklendiğinde Object Store'ları oluşturur.
 * Mevcut store'lara dokunmaz (güvenli idempotent kurulum).
 */
function setupSchema(db: IDBDatabase): void {
  // followers — her kullanıcının ID'si benzersiz birincil anahtar
  if (!db.objectStoreNames.contains(STORES.FOLLOWERS)) {
    db.createObjectStore(STORES.FOLLOWERS, { keyPath: "id" });
  }

  // following — aynı şema
  if (!db.objectStoreNames.contains(STORES.FOLLOWING)) {
    db.createObjectStore(STORES.FOLLOWING, { keyPath: "id" });
  }

  // unfollowers_history — timestamp birincil anahtar (zaman serisi)
  if (!db.objectStoreNames.contains(STORES.UNFOLLOWERS_HISTORY)) {
    db.createObjectStore(STORES.UNFOLLOWERS_HISTORY, { keyPath: "timestamp" });
  }
}

// ─── Dinamik Başlatma (Ana Giriş Noktası) ────────────────────────────────────

/**
 * Verilen email'e ait IndexedDB bağlantısını açar ve döndürür.
 * Bağlantı zaten cache'teyse yeniden açmaz — var olanı döndürür.
 *
 * @param email - Oturum açmış kullanıcının e-posta adresi
 */
export function initDB(email: string): Promise<IDBDatabase> {
  const dbName = sanitizeEmail(email);

  // ─── Singleton: Zaten açıksa direkt döndür ───────────────────────────
  const cached = connectionCache.get(dbName);
  if (cached) return Promise.resolve(cached);

  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB bu ortamda desteklenmiyor (SSR/Node)."));
      return;
    }

    const request = indexedDB.open(dbName, DB_VERSION);

    // Şema oluşturma / migrasyon
    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      setupSchema(db);
    };

    request.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Bağlantı beklenmedik şekilde kapanırsa cache'i temizle
      db.onclose = () => {
        connectionCache.delete(dbName);
      };

      // Versiyon çakışması — başka sekmede upgrade açık
      db.onversionchange = () => {
        db.close();
        connectionCache.delete(dbName);
        clientLogger.warn("indexeddb", `"${dbName}" versiyonu değişti, bağlantı kapatıldı`);
      };

      connectionCache.set(dbName, db);
      resolve(db);
    };

    request.onerror = () => {
      reject(
        new Error(
          `[IndexedDB] "${dbName}" açılamadı: ${request.error?.message ?? "Bilinmeyen hata"}`
        )
      );
    };

    request.onblocked = () => {
      clientLogger.warn(
        "indexeddb",
        `"${dbName}" yükseltmesi bloke edildi — diğer sekmeleri kapatıp tekrar deneyin`
      );
    };
  });
}

/**
 * Belirtilen email'in veritabanı bağlantısını cache'ten temizler ve kapatır.
 * Çıkış (logout) sırasında çağırın.
 */
export function closeDB(email: string): void {
  const dbName = sanitizeEmail(email);
  const db = connectionCache.get(dbName);
  if (db) {
    db.close();
    connectionCache.delete(dbName);
  }
}

// ─── Dahili Yardımcılar ───────────────────────────────────────────────────────

/**
 * Bir Object Store üzerinde transaction başlatır ve Promise'e sarar.
 */
function withTransaction<T>(
  db: IDBDatabase,
  storeName: StoreName,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, mode);
    } catch (err) {
      reject(err);
      return;
    }

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error(`[IndexedDB] Transaction iptal edildi: ${storeName}`));

    const store = tx.objectStore(storeName);
    const req = callback(store);

    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Store'daki tüm kayıtları siler, ardından yeni listeyi tek transaction'da yazar.
 * "clear + addAll" atomik değil, ancak IndexedDB'de tam reset için standart yaklaşım.
 */
async function clearAndPutAll<T>(
  db: IDBDatabase,
  storeName: StoreName,
  items: T[]
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error(`[IndexedDB] Transaction iptal: ${storeName}`));
    tx.oncomplete = () => resolve();

    const store = tx.objectStore(storeName);
    const clearReq = store.clear();

    clearReq.onsuccess = () => {
      for (const item of items) {
        store.put(item); // Hataları tx.onerror yakalar
      }
    };
    clearReq.onerror = () => reject(clearReq.error);
  });
}

/**
 * Store'daki tüm kayıtları dizi olarak döndürür.
 */
function getAll<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
  return withTransaction<T[]>(db, storeName, "readonly", (store) => store.getAll());
}

// ─── Public CRUD API ──────────────────────────────────────────────────────────

/**
 * Followers listesini kaydeder.
 * Eski followers verisi tamamen temizlenip yenisi yazılır (tam yenileme).
 *
 * @param email - Oturum açmış kullanıcının e-postası
 * @param data  - Kaydedilecek takipçi listesi
 */
export async function saveFollowers(
  email: string,
  data: IgUserRecord[]
): Promise<void> {
  const db = await initDB(email);
  await clearAndPutAll(db, STORES.FOLLOWERS, data);
}

/**
 * Kaydedilmiş followers listesini döndürür.
 *
 * @param email - Oturum açmış kullanıcının e-postası
 * @returns Takipçi dizisi (kayıt yoksa boş dizi)
 */
export async function getFollowers(email: string): Promise<IgUserRecord[]> {
  const db = await initDB(email);
  return getAll<IgUserRecord>(db, STORES.FOLLOWERS);
}

/**
 * Following listesini kaydeder.
 * Eski following verisi tamamen temizlenip yenisi yazılır.
 *
 * @param email - Oturum açmış kullanıcının e-postası
 * @param data  - Kaydedilecek takip edilenler listesi
 */
export async function saveFollowing(
  email: string,
  data: IgUserRecord[]
): Promise<void> {
  const db = await initDB(email);
  await clearAndPutAll(db, STORES.FOLLOWING, data);
}

/**
 * Kaydedilmiş following listesini döndürür.
 *
 * @param email - Oturum açmış kullanıcının e-postası
 * @returns Takip edilenler dizisi (kayıt yoksa boş dizi)
 */
export async function getFollowing(email: string): Promise<IgUserRecord[]> {
  const db = await initDB(email);
  return getAll<IgUserRecord>(db, STORES.FOLLOWING);
}

/**
 * Takipten çıkanları tarih damgasıyla geçmişe ekler (append — eski kayıtlar korunur).
 * Her çağrı yeni bir timestamp kaydı oluşturur.
 *
 * @param email       - Oturum açmış kullanıcının e-postası
 * @param unfollowers - Bu analizde tespit edilen takipten çıkanlar
 * @param opts        - Opsiyonel: önceki/sonraki takipçi sayısı
 */
export async function saveUnfollowersHistory(
  email: string,
  unfollowers: IgUserRecord[],
  opts?: { followersCountBefore?: number; followersCountAfter?: number }
): Promise<void> {
  const db = await initDB(email);
  const record: UnfollowerHistoryRecord = {
    timestamp: Date.now(),
    unfollowers,
    followersCountBefore: opts?.followersCountBefore ?? 0,
    followersCountAfter: opts?.followersCountAfter ?? 0,
  };
  await withTransaction<IDBValidKey>(
    db,
    STORES.UNFOLLOWERS_HISTORY,
    "readwrite",
    (store) => store.put(record)
  );
}

/**
 * Tüm takipten çıkma geçmişini en yeniden en eskiye sıralı döndürür.
 *
 * @param email - Oturum açmış kullanıcının e-postası
 * @returns Tarih damgalı geçmiş kayıt dizisi
 */
export async function getUnfollowersHistory(
  email: string
): Promise<UnfollowerHistoryRecord[]> {
  const db = await initDB(email);
  const all = await getAll<UnfollowerHistoryRecord>(db, STORES.UNFOLLOWERS_HISTORY);
  // En yeni kayıt başa gelsin
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Belirli bir kullanıcıya ait tüm veritabanını tamamen siler.
 * Dikkat: Bu işlem geri alınamaz.
 *
 * @param email - Silinecek kullanıcının e-postası
 */
export function deleteUserDatabase(email: string): Promise<void> {
  const dbName = sanitizeEmail(email);

  // Önce cache'teki bağlantıyı kapat
  closeDB(email);

  return new Promise<void>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB bu ortamda desteklenmiyor."));
      return;
    }

    const req = indexedDB.deleteDatabase(dbName);

    req.onsuccess = () => {
      clientLogger.debug("indexeddb", `"${dbName}" başarıyla silindi`);
      resolve();
    };

    req.onerror = () => {
      reject(
        new Error(
          `[IndexedDB] "${dbName}" silinemedi: ${req.error?.message ?? "Bilinmeyen hata"}`
        )
      );
    };

    req.onblocked = () => {
      clientLogger.warn(
        "indexeddb",
        `"${dbName}" silme işlemi bloke edildi — diğer sekmeleri kapatıp tekrar deneyin`
      );
    };
  });
}
