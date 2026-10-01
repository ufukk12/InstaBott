export const DB_NAME = "FollowerTrackerDB";
export const STORE_NAME = "auth_store";
const DB_VERSION = 1;

export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      return reject(new Error("IndexedDB is not available on the server."));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
}

export async function saveAuthData(sessionId: string, targetUsername: string, targetId: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const data = {
      id: "current_session",
      sessionId,
      targetUsername,
      targetId,
      updatedAt: new Date().toISOString(),
    };
    const request = store.put(data);

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

export async function getAuthData(): Promise<{sessionId: string, targetUsername: string, targetId: string} | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get("current_session");

    request.onsuccess = (e) => {
      resolve((e.target as IDBRequest).result || null);
    };
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

export async function clearAuthData(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete("current_session");

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

// ─── Aşama 1: Analiz Verisi (key-value) ─────────────────────────────────────

async function putRecord(id: string, payload: unknown): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ id, payload, updatedAt: new Date().toISOString() });
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function getRecord<T>(id: string): Promise<T | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = (e) => {
      const row = (e.target as IDBRequest).result;
      resolve(row?.payload ?? null);
    };
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

export async function saveAnalysisPayload(key: string, data: unknown): Promise<void> {
  await putRecord(key, data);
}

export async function loadAnalysisPayload<T>(key: string): Promise<T | null> {
  return getRecord<T>(key);
}

/**
 * Tek bir IndexedDB transaction içinde birden fazla kayıt yazar.
 * startAnalysis'deki 7 ayrı putRecord çağrısını birleştirir — daha hızlı ve atomik.
 */
export async function saveAnalysisPayloadBatch(entries: Record<string, unknown>): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const now = new Date().toISOString();

    for (const [key, payload] of Object.entries(entries)) {
      store.put({ id: key, payload, updatedAt: now });
    }

    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBTransaction).error);
    tx.onabort = (e) => reject((e.target as IDBTransaction).error);
  });
}

/**
 * ÇIKIŞ TEMİZLİĞİ — deponun TAMAMINI siler.
 *
 * NEDEN GEREKLİ: clearAllAnalysisData() yalnızca ÖNEKSİZ anahtarları ("followers",
 * "following", ...) siliyor. Gerçek veri ise `${email}_${hedef}_` önekiyle yazılıyor.
 * Yani çıkışta binlerce Instagram kullanıcı adı/ID'si, checkpoint'ler, analiz kilitleri
 * ve gözcü hesap bilgisi tarayıcıda KALIYORDU.
 *
 * Çıkışta hiçbir iz bırakmamak için tek tek anahtar saymak yerine object store
 * bütünüyle temizleniyor — yeni bir anahtar eklendiğinde burayı güncellemeyi
 * unutma riski de böylece ortadan kalkıyor.
 */
export async function wipeAllLocalData(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const request = tx.objectStore(STORE_NAME).clear();
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

export async function clearAllAnalysisData(): Promise<void> {
  const keys = [
    "followers", "following", "notfollowers", "unfollowing", "profileStats", "lastAnalysisAt", "analysisComplete",
    "likers", "ghostFollowers", "secretAdmirers", "ghostMediaId", "lastGhostAnalysisAt"
  ];
  await saveAnalysisPayloadBatch(Object.fromEntries(keys.map(k => [k, null])));
}

// ─── Gözcü Hesap Bilgisi ────────────────────────────────────────────────────
// Gözcü hesabın kullanıcı adı, doğrulandığı anda yerel olarak saklanır. Böylece
// "Gözcü Hesap" sayfası açılır açılmaz bilgiyi gösterebilir — her ziyarette
// Instagram'a durum sorgusu atmak zorunda kalmaz (istek bütçesi korunur).
// Canlı durum kontrolü kullanıcı tetiklidir.
//
// Mevcut key-value deposunu kullanır; yeni store veya şema değişikliği YOKTUR.

export type WatcherInfo = {
  username: string;
  /** Bu bilginin doğrulandığı an (ISO) */
  verifiedAt: string;
};

const WATCHER_INFO_KEY = "watcher_info";

export async function saveWatcherInfo(info: WatcherInfo): Promise<void> {
  await putRecord(WATCHER_INFO_KEY, info);
}

export async function getWatcherInfo(): Promise<WatcherInfo | null> {
  return getRecord<WatcherInfo>(WATCHER_INFO_KEY);
}

export async function clearWatcherInfo(): Promise<void> {
  await putRecord(WATCHER_INFO_KEY, null);
}

// ─── Aşama 3: Checkpoint (Sayfalama İlerleme Kaydı) ─────────────────────────

export interface CheckpointData {
  users: Array<{ id: string; username: string; full_name: string; is_private: boolean; profile_pic_url: string | null }>;
  nextMaxId: string | null;
  savedAt: string;
}

export async function saveCheckpoint(key: string, data: Omit<CheckpointData, "savedAt">): Promise<void> {
  await putRecord(`checkpoint_${key}`, { ...data, savedAt: new Date().toISOString() });
}

export async function loadCheckpoint(key: string): Promise<CheckpointData | null> {
  const record = await getRecord<CheckpointData>(`checkpoint_${key}`);
  if (!record) return null;
  // 15 dakikadan eski checkpoint'ler geçersiz kabul edilir (veri tazeliği).
  // Kısa tutulmasının sebebi: eski bir liste taze sayfalarla birleşince ortaya
  // tutarsız bir anlık görüntü çıkar. Yarıda kalan taramanın verisi zaten ayrıca
  // ana IndexedDB kaydına (TTL'siz) yazılıyor — bu TTL sadece "sayfalama ortasından
  // kusursuz devam" penceresini belirler, veri kaybını belirlemez.
  const age = Date.now() - new Date(record.savedAt).getTime();
  if (age > 15 * 60 * 1000) return null;
  return record;
}

export async function clearCheckpoint(key: string): Promise<void> {
  await putRecord(`checkpoint_${key}`, null);
}

// ─── Aşama 4: Analiz Kilidi (Concurrent Run Prevention) ─────────────────────

const LOCK_TTL_MS = 10 * 60 * 1000; // 10 dakika — tarayıcı çökmesinde kalıcı kilidi önler

interface LockRecord {
  lockedAt: string;
  type: string;
}

export async function acquireAnalysisLock(type: "main" | "ghost"): Promise<boolean> {
  const key = `analysis_lock_${type}`;
  const db = await initDB();

  // ÖNEMLİ: Oku + koşullu yaz tek transaction içinde yapılır.
  // getRecord() + putRecord() gibi iki AYRI transaction kullanılsaydı, ikisi arasındaki
  // boşlukta (özellikle iki sekme aynı anda çağırırsa) her iki çağrı da kilidi "boş" görüp
  // ikisi de true dönebilirdi (TOCTOU race) — kilidin var olma amacını boşa çıkarırdı.
  // Aynı objectStore'a açılan transaction'lar IndexedDB tarafından sıraya alındığı için
  // tek transaction içindeki okuma+yazma atomik davranır.
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(key);

    getReq.onsuccess = () => {
      const existing = getReq.result?.payload as LockRecord | undefined;

      if (existing) {
        const age = Date.now() - new Date(existing.lockedAt).getTime();
        if (age < LOCK_TTL_MS) {
          // Kilit hâlâ geçerli — aynı transaction içinde karar verildi, race yok
          resolve(false);
          return;
        }
        // Kilit süresi dolmuş — üzerine yaz
      }

      store.put({
        id: key,
        payload: { lockedAt: new Date().toISOString(), type } as LockRecord,
        updatedAt: new Date().toISOString(),
      });
      resolve(true);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function releaseAnalysisLock(type: "main" | "ghost"): Promise<void> {
  await putRecord(`analysis_lock_${type}`, null);
}
