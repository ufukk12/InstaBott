"use client";

// İstemci Orkestratörü — Optimize Edilmiş
// Python'daki main() akışının TypeScript karşılığı:
//   1. get_user_id → profil bilgisi al
//   2. fetch_followers → tüm takipçileri çek (sayfalı)
//   3. fetch_following → tüm takip edilenleri çek (sayfalı)
//   4. compare_follow_lists → Hash Map analizi
//
// Optimizasyonlar:
//   • callPageApi/callLikersApi → generic callPaginatedApi (DRY)
//   • fetchWithPagination/fetchLikersWithPagination → generic runPaginationLoop (DRY)
//   • fetchWithDeficitRetry/fetchLikersWithDeficitRetry → generic runDeficitRetry (DRY)
//   • AbortController + 18s timeout (Aşama 2)
//   • Exponential Backoff + Retry-After (Aşama 2)
//   • Checkpoint — her sayfada cursor+veri kaydı (Aşama 3)
//   • Analysis Lock — paralel tetikleme engeli (Aşama 4)
//   • Map tabanlı inline dedup + Jitter gecikme (Equilibrium Aşama 1)
//   • Denge Kontrolü (Equilibrium Check) ile akıllı durdurma (Equilibrium Aşama 2)

import type { IgUser } from "@/lib/instagramApi";
import { MAX_SERVER_REQUEST_DURATION_MS, PAGE_SIZE } from "@/lib/instagramConstants";
import { toSafeId } from "@/lib/ids";
import { clientLogger, clientErrorMeta } from "@/lib/clientLogger";
import { buildPositionModel, predictFollowingWindow } from "@/lib/followPositionModel";
import { runFullAnalysis, runGhostAnalysis } from "@/lib/instagramAnalysis";
import {
  saveAnalysisPayload,
  saveAnalysisPayloadBatch,
  loadAnalysisPayload,
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  acquireAnalysisLock,
  releaseAnalysisLock,
} from "@/lib/idb";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

// ─── İnsan Hızı Profili (Jitter) ─────────────────────────────────────────────
// KADEMELİ TASARIM: Instagram'ın action-block sezgileri hem mutlak istek hacmine hem de
// SÜRDÜRÜLEN hıza duyarlıdır. Kısa taramalar (kullanıcıların çoğunluğu) toplamda düşük
// hacimde kaldığı için güvenle hızlı gidebilir; uzun taramalar dakikalarca sürdürülen bir
// hız ürettiğinden kademeli olarak frenlenir.
//
// 401 KORUNMASI: Tüm katmanlar 401/action-block riskini minimuma indirmek için
// konservatif ayarlanmıştır. Instagram'ın bot tespit mekanizması hem istek sıklığına
// hem de tutarlı zamanlama örüntüsüne bakar — bu yüzden geniş aralıklar ve rastgele
// molalar kullanılır.
type DelayTier = { upToRequests: number; minMs: number; maxMs: number };

const DELAY_TIERS: DelayTier[] = [
  { upToRequests: 40,  minMs: 3_500, maxMs: 5_500 },        // Isınma — küçük hesaplar burada biter
  { upToRequests: 150, minMs: 4_200, maxMs: 6_500 },        // Orta — güvenli sürdürülebilir hız
  { upToRequests: Infinity, minMs: 5_500, maxMs: 8_500 },   // Uzun tarama — tam frenleme
];

// Psikoloji molası. Aralık RASTGELE: sabit periyodun kendisi tespit edilebilir bir
// örüntüdür — gerçek bir kullanıcı tam olarak her N istekte bir duraklamaz.
const PSYCHO_DELAY_MIN_MS = 9_500;
const PSYCHO_DELAY_MAX_MS = 14_000;
const PSYCHO_EVERY_MIN_REQUESTS = 10;
const PSYCHO_EVERY_MAX_REQUESTS = 16;

// Uzun mola — telefonu bir kenara bırakma davranışı. Sadece uzun taramalarda tetiklenir.
const LONG_BREAK_MIN_MS = 28_000;
const LONG_BREAK_MAX_MS = 45_000;
const LONG_BREAK_EVERY_MIN_REQUESTS = 55;
const LONG_BREAK_EVERY_MAX_REQUESTS = 85;

// Tereddüt payı: düzgün (uniform) dağılım tek başına fazla "makinemsi" bir imza bırakır.
// Bu, dağılıma insan davranışındaki sağa çarpık kuyruğu ekler.
const HESITATION_CHANCE = 0.20;
const HESITATION_MIN_MS = 800;
const HESITATION_MAX_MS = 2_500;

// ─── Onarım / Doğrulama Temposu ──────────────────────────────────────────────
// Detaylı arama ve GT doğrulaması taramanın EN SICAK anında çalışır: hesap o noktada
// zaten yüzlerce istek atmıştır ve throttle eşiğine en yakın olduğu yerdir. Gerçek
// loglarda 401 tam da bu aşamada geldi — ana tarama sorunsuz bitmişti.
//
// Bu yüzden onarım aşamasında gecikmeler çarpanla artırılır ve molalar sıklaştırılır.
// Taban değerler zaten konservatif olduğu için çarpan ölçülü tutuldu.
//
// Mutlak maliyet düşük: orantı koruması sayesinde onarım artık az sayıda imleçte
// çalışıyor, dolayısıyla bu yavaşlama dakikalar değil saniyeler ekliyor.
const REPAIR_DELAY_MULTIPLIER = 1.4;
const REPAIR_PAUSE_FREQUENCY_DIVISOR = 1.5; // Molalar ~1.5 kat daha sık

let delayMultiplier = 1;
let pauseFrequencyDivisor = 1;

/** Verilen işi "onarım temposu" ile çalıştırır; bitince normal tempoya döner. */
async function withRepairPacing<T>(fn: () => Promise<T>): Promise<T> {
  delayMultiplier = REPAIR_DELAY_MULTIPLIER;
  pauseFrequencyDivisor = REPAIR_PAUSE_FREQUENCY_DIVISOR;
  try {
    return await fn();
  } finally {
    delayMultiplier = 1;
    pauseFrequencyDivisor = 1;
  }
}

const MAX_RATE_LIMIT_RETRIES = 10;
// DÜZELTME: Sabit 18s yerine sunucunun (instagramApi.ts → igRequest) olası en kötü
// senaryo süresinden türetiliyor (+ güvenlik payı). Sabit 18s bırakılsaydı, sunucu
// kendi içinde 2 kez retry ederken (~57s'ye kadar sürebilir) client bundan çok daha
// önce "NETWORK" hatasıyla pes edip sunucu hâlâ çalışırken gereksiz yere iptal ederdi.
const CLIENT_TIMEOUT_MS = MAX_SERVER_REQUEST_DURATION_MS + 5_000; // 5sn güvenlik payı
const CHECKPOINT_SAVE_EVERY = 3; // Her N sayfada bir checkpoint kaydet (IDB yazım maliyetini azaltır)
// Büyük Hesap Ölçeklendirmesi ─────────────────────────────────────────────────
// TARGET_CHECKPOINT_COUNT: bir taramanın tamamı boyunca yapılacak checkpoint yazımı
// sayısının üst sınırı. CHECKPOINT_SAVE_EVERY sabit kalsaydı, checkpoint her seferinde
// TÜM birikmiş listeyi yeniden yazdığından (idb.ts → saveCheckpoint), toplam yazılan byte
// hacmi sayfa sayısının KARESİYLE büyürdü (200 takipçide önemsiz, 500.000 takipçide —
// binlerce sayfa— checkpoint başına yazılan veri de arttıkça toplamda ikinci dereceden
// bir maliyete dönüşür). Aralığı beklenen sayfa sayısına göre ölçekleyerek toplam
// checkpoint sayısını hesap büyüklüğünden bağımsız, sabit bir üst sınırda tutuyoruz.
const TARGET_CHECKPOINT_COUNT = 25;
const CLIENT_NETWORK_RETRY_MAX = 3; // Client↔kendi sunucusu arası geçici kopmalar için
const CLIENT_NETWORK_RETRY_DELAY_MS = 2_000;
// Hiçbir sayfa kırpılmamış göründüğü hâlde toplamda eksik varsa, körlemesine onarılacak
// imleç sayısının üst sınırı. Sınırsız bırakılsaydı büyük hesaplarda yüzlerce gereksiz
// istek (ve rate-limit maruziyeti) anlamına gelirdi.
const MAX_BLIND_REPAIR_CURSORS = 8;
// Kör onarımın devreye girmesi için gereken en az fark. Bu eşiklerin altındaki fark
// organik hareketlilik kabul edilir (bkz. runDeficitRetry içindeki orantı koruması).
// Kanıtlı (kırpılmış sayfa) eksikler bu eşiklerden ETKİLENMEZ.
const BLIND_REPAIR_MIN_DEFICIT = 5;
const BLIND_REPAIR_MIN_RATIO = 0.005; // %0.5

// ─── Tip Tanımları ────────────────────────────────────────────────────────────

export type AnalysisProgress = {
  step: string;
  message: string;
  current?: number;
  total?: number;
  cooldownSeconds?: number;
};

export type StoredAnalysis = {
  followers: IgUser[];
  following: IgUser[];
  notFollowers: IgUser[];
  unfollowing: IgUser[];
  lastAnalysisAt: string | null;
  profileStats: {
    followersCount: number;
    followingCount: number;
    expectedFollowers: number;
    expectedFollowing: number;
  } | null;
  /**
   * false → bu veri yarıda kesilmiş bir taramadan geliyor, EKSİKTİR.
   *
   * ⚠️ Takipten çıkanlar tespiti (detectUnfollowers) ileride analiz akışına bağlanırsa,
   * bu bayrak false iken ÇALIŞTIRILMAMALIDIR: çekilemeyen kişiler "takipten çıktı"
   * olarak yorumlanır ve yanlış alarm üretir.
   */
  analysisComplete: boolean;
  /** Kullanıcının "yok say" dediği kişilerin id'leri (işletme hesapları vb.) */
  ignoredIds: string[];
  /** GT doğrulaması için kalan eksik kayıt sayısı (0 → doğrulanacak bir şey yok) */
  gtMissingCount: number;
};

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Kaç KİŞİ çekildi — yalnızca loglama/telemetri için. */
export let sessionFetchedCount = 0;

// DÜZELTME: Tempo kararı artık İSTEK sayısına bağlı, çekilen kişi sayısına değil.
// Eskiden mola her 500 KİŞİde bir veriliyordu; bu, PAGE_SIZE değişince mola sıklığının
// da sessizce değişmesi demekti (200→100 geçişi sürdürülen hızı ~%34 yükseltmişti).
// Rate limit isteklere uygulanır, kişilere değil — sayaç da öyle olmalı.
let sessionRequestCount = 0;
let nextPsychoAtRequest = randBetween(PSYCHO_EVERY_MIN_REQUESTS, PSYCHO_EVERY_MAX_REQUESTS);
let nextLongBreakAtRequest = randBetween(LONG_BREAK_EVERY_MIN_REQUESTS, LONG_BREAK_EVERY_MAX_REQUESTS);

export const resetJitterState = () => {
    sessionFetchedCount = 0;
    sessionRequestCount = 0;
    requestTimestamps = [];
    momentumFactor = 1;
    nextPsychoAtRequest = randBetween(PSYCHO_EVERY_MIN_REQUESTS, PSYCHO_EVERY_MAX_REQUESTS);
    nextLongBreakAtRequest = randBetween(LONG_BREAK_EVERY_MIN_REQUESTS, LONG_BREAK_EVERY_MAX_REQUESTS);
};

// ─── Duraklama Bildirimi (UI Senkronizasyonu) ────────────────────────────────
// Uzun molalar (psikoloji ~8-12s, uzun mola ~22-38s) boyunca arayüz TAMAMEN sessiz
// kalıyordu — kullanıcı analizin donduğunu sanıyordu. Orkestratör bu kanalı kurar,
// humanDelay uzun duraklamaları saniye saniye buraya raporlar.
let pauseReporter: ((p: AnalysisProgress) => void) | null = null;

/**
 * Bu eşiğin altındaki duraklamalar arayüze BİLDİRİLMEZ.
 *
 * Eşik, psikoloji molasının üst sınırının (11.7s) üzerinde tutuluyor: kullanıcı talebi
 * üzerine "kısa mola veriliyor" bildirimi arayüzde gösterilmiyor. Sadece uzun molalar
 * (22-38s) geri sayımla raporlanıyor — orada sessizlik "sistem dondu" izlenimi verirdi.
 */
const PAUSE_REPORT_THRESHOLD_MS = 15_000;

const setPauseReporter = (fn: ((p: AnalysisProgress) => void) | undefined) => {
    pauseReporter = fn ?? null;
};

// ─── Mola Aktivitesi (Örtü Trafiği) ──────────────────────────────────────────
// Gerçek bir kullanıcı, takipçi listesini 200 kez üst üste çağıran bir uç noktaya
// kilitlenmez; arada bir profile bakar, kendi sayfasını açar. Sadece TEK endpoint'e
// yığılan trafik, hacimden bağımsız olarak tanınabilir bir imzadır.
//
// Bu yüzden uzun molalarda boş beklemek yerine ARADA farklı bir okuma isteği atılır.
//
// TASARIM KURALLARI:
//   • SADECE OKUMA — takip/beğeni gibi hiçbir yazma işlemi yapılmaz
//   • Molanın İÇİNDE çalışır → toplam süre değişmez, sadece boşluk dolar
//   • Bütçeye SAYILIR (enforceRequestBudget) → gizli ek yük oluşturmaz
//   • Hatası tamamen yutulur → analizi asla etkilemez
//   • Mevcut /api/ig/get-profile kullanılır → yeni uç nokta yok
type DecoyRunner = () => Promise<void>;

let decoyRunner: DecoyRunner | null = null;

/** Bu süreden kısa molalarda aktivite yapılmaz — sığmaz, sırıtır. */
const DECOY_MIN_PAUSE_MS = 12_000;

const setDecoyRunner = (fn: DecoyRunner | undefined) => {
    decoyRunner = fn ?? null;
};

/**
 * Molayı ikiye bölüp aralarında bir "başka aktivite" isteği atar.
 * Molanın TOPLAM süresi korunur — aktivite ek süre getirmez, boşluğu doldurur.
 */
async function pauseWithActivity(ms: number, label: string): Promise<void> {
    if (!decoyRunner || ms < DECOY_MIN_PAUSE_MS) {
        await reportedSleep(ms, label);
        return;
    }

    // Aktiviteyi molanın ortasına yakın rastgele bir noktaya yerleştir
    const before = randBetween(Math.floor(ms * 0.3), Math.floor(ms * 0.7));
    await reportedSleep(before, label);

    try {
        await decoyRunner();
    } catch {
        // Örtü trafiği asla analizi etkilemez
    }

    await reportedSleep(Math.max(0, ms - before), label);
}

/**
 * Uzun duraklamayı saniyelik geri sayımla raporlayarak bekler.
 *
 * İlk bildirim "human-sim" adımıyla TEK bir log satırı üretir; sonraki tick'ler
 * "pause-tick" adımıyla yalnızca ilerleme durumunu günceller. Aksi halde 38 saniyelik
 * bir mola, log terminaline 38 satır yazardı.
 */
const reportedSleep = async (ms: number, label: string): Promise<void> => {
    if (!pauseReporter || ms < PAUSE_REPORT_THRESHOLD_MS) {
        await sleep(ms);
        return;
    }

    const totalSec = Math.ceil(ms / 1000);
    pauseReporter({ step: "human-sim", message: `${label} (~${totalSec} sn)` });

    for (let remaining = totalSec; remaining > 0; remaining--) {
        pauseReporter({
            step: "pause-tick",
            message: `${label} — ${remaining} sn`,
            cooldownSeconds: remaining,
        });
        await sleep(1000);
    }
};

// ─── Analiz İptali (Çıkış Senkronizasyonu) ───────────────────────────────────
// Analiz tarayıcıda bir promise zinciri olarak çalışır; sayfa değiştirmek veya çıkış
// yapmak onu DURDURMAZ — sessionId closure'da tutulduğu için istek atmaya devam eder.
// Bu bayrak, çıkışta arka plandaki gözcü trafiğini kesmek için var.
//
// Kontrol TEK noktada: humanDelay her istekten önce çağrıldığı için, buradaki tek
// kontrol tüm istek noktalarını (sayfalama, onarım, güvenlik turu, doğrulama) kapsar.
// Veri çekme mantığına başka hiçbir müdahale yapılmadı.
const ABORT_ERROR = "ANALYSIS_ABORTED";
let abortRequested = false;

/** Çıkış yapılırken çağrılır — devam eden analiz bir sonraki istekten önce durur. */
export function requestAnalysisAbort(): void {
  abortRequested = true;
}

/** Yeni bir analiz başlarken bayrağı sıfırlar. */
export function clearAnalysisAbort(): void {
  abortRequested = false;
}

// ─── Kayan Pencere İstek Bütçesi ─────────────────────────────────────────────
// Mevcut jitter YEREL düşünüyor: "iki istek arasında ne kadar bekleyeyim?"
// Bu katman KÜRESEL düşünüyor: "son N dakikada kaç istek attım?"
//
// NEDEN GEREKLİ: Momentum ve mola aktivitesi gibi eklemeler, tek tek bakıldığında
// masum görünse de birleşince sürdürülen hızı farkında olmadan yükseltebilir.
// Bu tavan, hangi desen uygulanırsa uygulansın ihlal edilemez bir sınır koyar —
// güvenlik artık tahmin değil, ispatlanabilir bir özellik.
//
// Tavan mevcut davranışın ÜSTÜNDE ayarlandı: normal akışta hiç devreye girmez,
// yalnızca bir şeyler beklenenden hızlandığında frene basar.
const BUDGET_WINDOW_MS = 5 * 60 * 1000;
const BUDGET_MAX_IN_WINDOW = 45; // 5 dakikada en fazla 45 istek (~9/dk)

let requestTimestamps: number[] = [];

/**
 * Bütçe dolmuşsa, pencere açılana kadar bekler. Her istekten önce çağrılır —
 * mola aktivitesi (decoy) istekleri de dahil, çünkü onlar da Instagram'a gidiyor.
 */
async function enforceRequestBudget(): Promise<void> {
    // En fazla birkaç tur döner: beklemeden sonra en eski kayıt pencereden düşer.
    for (let guard = 0; guard < 10; guard++) {
        const now = Date.now();
        requestTimestamps = requestTimestamps.filter((t) => now - t < BUDGET_WINDOW_MS);

        if (requestTimestamps.length < BUDGET_MAX_IN_WINDOW) {
            requestTimestamps.push(now);
            return;
        }

        const waitMs = BUDGET_WINDOW_MS - (now - requestTimestamps[0]) + 250;
        clientLogger.warn(
            "butce",
            `İstek bütçesi doldu (${requestTimestamps.length}/${BUDGET_MAX_IN_WINDOW} · ${BUDGET_WINDOW_MS / 60000} dk) — ${Math.ceil(waitMs / 1000)} sn bekleniyor`
        );
        await reportedSleep(waitMs, "İstek bütçesi doldu, güvenlik için bekleniyor");
    }

    // Buraya normalde ulaşılmaz; yine de isteği kayda geç ve devam et.
    requestTimestamps.push(Date.now());
}

// ─── Model D: Momentum (Otokorelasyonlu Gecikme) ─────────────────────────────
// Şu ana kadar her gecikme BAĞIMSIZ çekiliyordu (randBetween). Ama gerçek insan
// davranışında ardışık süreler birbiriyle ilişkilidir — hızlı bir kaydırmayı yine
// hızlı bir kaydırma izler. Bağımsız rastgele çekiliş, kendi başına bir bot imzasıdır.
//
// Burada yapılan "daha çok rastgelelik" değil, rastgeleliğe HAFIZA eklemek:
// ortalamaya geri çeken (mean-reverting) bir rastgele yürüyüş.
//
// ÖNEMLİ: Denge noktası 1.0'dır (f = f·0.65 + 0.35 → f = 1), yani ORTALAMA GECİKME
// DEĞİŞMEZ. Sadece dağılımın şekli insansılaşır.
const MOMENTUM_INERTIA = 0.65;   // önceki gecikmenin ağırlığı
const MOMENTUM_REVERSION = 0.35; // ortalamaya dönüş kuvveti
const MOMENTUM_SHOCK = 0.5;      // tur başına rastgele sapma genliği (±0.25)
const MOMENTUM_MIN = 0.60;
const MOMENTUM_MAX = 1.45;

let momentumFactor = 1;

function nextMomentumFactor(): number {
    const shock = (Math.random() - 0.5) * MOMENTUM_SHOCK;
    const next = momentumFactor * MOMENTUM_INERTIA + MOMENTUM_REVERSION + shock;
    momentumFactor = Math.min(MOMENTUM_MAX, Math.max(MOMENTUM_MIN, next));
    return momentumFactor;
}

// ─── Model C: Dikkat Dağınıklığı ─────────────────────────────────────────────
// Konumdan ve yorgunluktan BAĞIMSIZ, rastgele duraklama: "birinin profiline girdi,
// baktı, geri döndü". Kademeli yavaşlamanın üretemediği türden bir kuyruk ekler.
const DISTRACTION_CHANCE = 0.06;
const DISTRACTION_MIN_MS = 15_000;
const DISTRACTION_MAX_MS = 45_000;

const humanDelay = async (): Promise<void> => {
    if (abortRequested) throw new Error(ABORT_ERROR);
    await enforceRequestBudget();
    sessionRequestCount++;

    // Uzun mola — en seyrek, en uzun duraklama
    if (sessionRequestCount >= nextLongBreakAtRequest) {
        nextLongBreakAtRequest =
            sessionRequestCount + randBetween(LONG_BREAK_EVERY_MIN_REQUESTS, LONG_BREAK_EVERY_MAX_REQUESTS);
        const ms = randBetween(LONG_BREAK_MIN_MS, LONG_BREAK_MAX_MS);
        clientLogger.debug("jitter", `Uzun mola: ${ms}ms (istek #${sessionRequestCount})`);
        await pauseWithActivity(ms, "Uzun mola veriliyor (insan davranışı simülasyonu)");
        return;
    }

    // Psikoloji molası — bir sonraki tetik noktası her seferinde yeniden rastgeleleniyor.
    // Onarım temposunda aralık bölünür → molalar sıklaşır.
    if (sessionRequestCount >= nextPsychoAtRequest) {
        const interval = Math.max(
            3,
            Math.round(
                randBetween(PSYCHO_EVERY_MIN_REQUESTS, PSYCHO_EVERY_MAX_REQUESTS) / pauseFrequencyDivisor
            )
        );
        nextPsychoAtRequest = sessionRequestCount + interval;
        const ms = Math.round(randBetween(PSYCHO_DELAY_MIN_MS, PSYCHO_DELAY_MAX_MS) * delayMultiplier);
        clientLogger.debug("jitter", `Kısa mola: ${ms}ms (istek #${sessionRequestCount}, çekilen: ${sessionFetchedCount})`);
        await pauseWithActivity(ms, "Kısa mola veriliyor (insan davranışı simülasyonu)");
        return;
    }

    // Model C — Dikkat dağınıklığı: konumdan bağımsız, rastgele "profile baktı" duraklaması
    if (Math.random() < DISTRACTION_CHANCE) {
        const ms = randBetween(DISTRACTION_MIN_MS, DISTRACTION_MAX_MS);
        clientLogger.debug("jitter", `Dikkat dağınıklığı: ${ms}ms (istek #${sessionRequestCount})`);
        // Kullanıcıya gösterilen metin bilinçli olarak yumuşak: arka planda ne yapıldığını
        // teşhir etmek yerine nötr bir durum bildiriyor.
        await pauseWithActivity(ms, "Liste yenileniyor");
        return;
    }

    // Kademeye göre temel gecikme
    const tier =
        DELAY_TIERS.find((t) => sessionRequestCount <= t.upToRequests) ?? DELAY_TIERS[DELAY_TIERS.length - 1];
    let ms = randBetween(tier.minMs, tier.maxMs);

    if (Math.random() < HESITATION_CHANCE) {
        ms += randBetween(HESITATION_MIN_MS, HESITATION_MAX_MS);
    }

    // Model D — Momentum: ardışık gecikmeler artık bağımsız değil.
    // Denge noktası 1.0 olduğu için ORTALAMA değişmez, yalnızca dağılım insansılaşır.
    ms *= nextMomentumFactor();

    // Onarım/doğrulama aşamasında taban gecikme çarpanla artırılır
    await sleep(Math.round(ms * delayMultiplier));
};

// ─── Rate Limit Hatası (retryAfter'ı taşıyan özel Error tipi) ────────────────
// Sunucu Retry-After header'ını okuyup buraya kadar taşıyabilsin diye (bkz. instagramApi.ts
// → igRequest). error.message === "RATE_LIMIT" ile eski kontroller hâlâ çalışır çünkü
// message alanı yine "RATE_LIMIT" olarak set ediliyor.
class RateLimitError extends Error {
  retryAfter: number | null;
  constructor(retryAfter: number | null) {
    super("RATE_LIMIT");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

// ─── Kısmi Veri Hatası (Graceful Shutdown) ───────────────────────────────────
// Bir tarama kalıcı bir hatayla kesildiğinde (rate limit tükendi, oturum öldü),
// o ana kadar toplanan veriyi hatanın ÜZERİNDE taşır. Böylece çağıran katman
// (startAnalysis) veriyi IndexedDB'ye yazıp işlemi zarifçe sonlandırabilir.
//
// message alanı, sarmalanan hatanın orijinal mesajını korur — "SESSION_INVALID"
// gibi mesaja bakan mevcut kontroller çalışmaya devam eder.
export class PartialDataError extends Error {
  readonly partial: IgUser[];
  readonly reason: "RATE_LIMIT" | "SESSION_INVALID" | "UNKNOWN";

  constructor(message: string, partial: IgUser[], reason: PartialDataError["reason"]) {
    super(message);
    this.name = "PartialDataError";
    this.partial = partial;
    this.reason = reason;
  }
}

// ─── Generic Paginated API Call (DRY — callPageApi + callLikersApi birleşimi) ─

async function callPaginatedApi(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ users: IgUser[]; nextMaxId: string | null }> {
  // Opt-2: clearTimeout sadece finally'de — catch içindeki fazla çağrı kaldırıldı
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // AbortError (timeout) veya ağ hatası — retry edilebilir
    throw new Error("NETWORK");
  } finally {
    // finally her zaman çalışır — tek clearTimeout yeterli
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 429 || data.code === "RATE_LIMIT") {
    // Route handler'ınız Retry-After'ı gövdeye eklerse (bkz. altta not) burada okunur;
    // eklemezse retryAfter null kalır ve runSmartCooldown otomatik exponential backoff'a düşer.
    const retryAfter = typeof data.retryAfter === "number" ? data.retryAfter : null;
    throw new RateLimitError(retryAfter);
  }
  if (res.status === 401 || data.code === "INVALID_SESSION") {
    throw new Error("SESSION_INVALID");
  }
  if (!res.ok) {
    // NETWORK hatası olarak işaretle — runPaginationLoop retry edebilir
    throw new Error(data.code === "NETWORK" ? "NETWORK" : (data.error ?? `HTTP_${res.status}`));
  }

  return {
    users: Array.isArray(data.users) ? data.users : [],
    nextMaxId: data.nextMaxId != null ? String(data.nextMaxId) : null,
  };
}

// ─── Smart Cooldown (Aşama 2 — Retry-After + Exponential Backoff) ─────────────
// Sabit 60s yerine akıllı bekleme:
//   1. Retry-After header varsa → o kadar bekle (maks 120s)
//   2. Yoksa → Exponential Backoff: 4s, 8s, 16s, 32s, 60s cap
//   3. Her saniye kullanıcıya kalan süre gösterilir

async function runSmartCooldown(
  attempt: number,
  onProgress: ((p: AnalysisProgress) => void) | undefined,
  current: number,
  total: number,
  retryAfterSeconds?: number | null
) {
  // Sunucudan gerçek Retry-After geldiyse onu kullan (maks 120s); gelmediyse Exponential Backoff
  const waitSeconds =
    retryAfterSeconds != null && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds, 120)
      : Math.ceil(Math.min(4 * Math.pow(2, attempt - 1), 60));

  for (let remaining = waitSeconds; remaining > 0; remaining--) {
    onProgress?.({
      step: "cooldown",
      message: `Instagram sunucuları dinlendiriliyor, lütfen bekleyin... (${remaining} saniye)`,
      cooldownSeconds: remaining,
      current,
      total,
    });
    await sleep(1000);
  }
}

// ─── Generic Pagination Loop (Map tabanlı inline dedup + Checkpoint) ──────────
// Kümülatif Ekleme: Dışarıdan verilen Map'e ekler, asla sıfırlamaz.
// while(true) döngüsü, humanDelay, rate-limit retry mantığı birebir korunuyor.

async function runPaginationLoop(opts: {
  fetchPage: (maxId: string | null) => Promise<{ users: IgUser[]; nextMaxId: string | null }>;
  totalCount: number;
  label: string;
  checkpointKey: string;
  cumulativeMap?: Map<string, IgUser>;
  onProgress?: (p: AnalysisProgress) => void;
}): Promise<{
  users: IgUser[];
  pageCursors: (string | null)[];
  pageSizes: number[];
  rawPageSizes: number[];
}> {
  const { fetchPage, totalCount, label, checkpointKey, onProgress } = opts;

  // Checkpoint'ten devam et (varsa)
  const checkpoint = await loadCheckpoint(checkpointKey);

  // Kümülatif Map: Dışarıdan geldiyse onu kullan (No Wipe — asla sıfırlanmaz),
  // gelmediyse yeni bir Map oluştur (ilk tur veya bağımsız kullanım).
  const userMap = opts.cumulativeMap ?? new Map<string, IgUser>();

  // Checkpoint'teki verileri de Map'e kümülatif ekle (zaten varsa dokunma)
  if (checkpoint?.users) {
    for (const u of checkpoint.users) {
      const id = toSafeId(u);
      if (id && !userMap.has(id)) userMap.set(id, u);
    }
  }

  let nextMaxId: string | null = checkpoint?.nextMaxId ?? null;
  let isFirstPage = checkpoint == null;
  let skipNextDelay = checkpoint != null;
  let rateLimitRetries = 0;
  let networkRetries = 0;
  let pageCount = 0;
  const pageCursors: (string | null)[] = [nextMaxId];
  const pageSizes: number[] = [];
  // DÜZELTME (doğruluk): pageSizes dedup SONRASI sayıyı tutuyor. Eksik hesabı bunun
  // üzerinden yapılınca, sayfalar arası ÇAKIŞMA "eksik veri" sanılıyordu. rawPageSizes
  // Instagram'ın gerçekten döndürdüğü sayıyı tutar — sayfanın kırpılıp kırpılmadığının
  // tek güvenilir sinyali budur.
  const rawPageSizes: number[] = [];

  // Büyük Hesap Ölçeklendirmesi: checkpoint sıklığını beklenen toplam sayfa sayısına göre
  // ölçekle — küçük hesaplarda CHECKPOINT_SAVE_EVERY (3) sabit kalır, büyük hesaplarda
  // toplam checkpoint sayısı ~TARGET_CHECKPOINT_COUNT'ta sabitlenir (bkz. sabit tanımı).
  // Sonucu ASLA etkilemez — sadece ara kayıt sıklığını değiştirir.
  const estimatedTotalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 0;
  const checkpointEvery =
    estimatedTotalPages > TARGET_CHECKPOINT_COUNT
      ? Math.ceil(estimatedTotalPages / TARGET_CHECKPOINT_COUNT)
      : CHECKPOINT_SAVE_EVERY;

  if (checkpoint) {
    onProgress?.({
      step: "fetching",
      message: `${label} listesi kaldığı yerden devam ediyor... (${userMap.size}/${totalCount || "?"} hesap)`,
      current: userMap.size,
      total: totalCount,
    });
  }

  // Python'daki while True döngüsünün karşılığı
  while (true) {
    // Jitter gecikme
    if (!skipNextDelay && !isFirstPage) await humanDelay();
    skipNextDelay = false;
    isFirstPage = false;

    try {
      const page = await fetchPage(nextMaxId);

      // Python'daki: if page.users is empty → break
      if (page.users.length === 0) break;

      // Kümülatif Ekleme: Map'e ekle - zaten varsa O(1) geç, yoksa ekle
      let newlyAdded = 0;
      for (const user of page.users) {
        const id = toSafeId(user);
        if (id && !userMap.has(id)) {
          userMap.set(id, user);
          newlyAdded++;
          sessionFetchedCount++;
        }
      }
      
      pageSizes.push(newlyAdded);
      rawPageSizes.push(page.users.length);

      rateLimitRetries = 0;
      networkRetries = 0;
      pageCount++;

      onProgress?.({
        step: "fetching",
        message: `${label} taranıyor... (${userMap.size}/${totalCount || "?"} hesap bulundu)`,
        current: userMap.size,
        total: totalCount,
      });

      // Akıllı Erken Çıkış: Map boyutu beklenen sayıya ulaştıysa sayfalamayı bitir
      // Opt-3: Checkpoint kaydı kaldırıldı — çıkışta clearCheckpoint zaten çağrılıyor
      if (totalCount > 0 && userMap.size >= totalCount) break;

      // Python'daki: max_id = data.get("next_max_id"); if not max_id: break
      nextMaxId = page.nextMaxId;
      if (nextMaxId) {
        pageCursors.push(nextMaxId);
      }

      // Checkpoint throttle: her CHECKPOINT_SAVE_EVERY sayfada bir kaydet (son sayfa hariç).
      // DÜZELTME: eskiden `|| !nextMaxId` son sayfada da kaydediyordu — yorumdaki niyetin
      // ("son sayfa hariç") tam tersi. Sonuç: her başarılı çalışmada 1 gereksiz IDB yaz+sil
      // çifti (aşağıdaki clearCheckpoint hemen ardından zaten temizliyordu). nextMaxId artık
      // koşula dahil edilerek sadece "devam edilecek sayfa varken" kaydediliyor.
      if (nextMaxId && pageCount % checkpointEvery === 0) {
        const currentUsers = Array.from(userMap.values());
        await saveCheckpoint(checkpointKey, { users: currentUsers, nextMaxId });
      }

      if (!nextMaxId) break;
    } catch (error) {
      // İPTAL: kullanıcı çıkış yaptı — checkpoint yazmadan derhal çık.
      // (Veriler zaten çıkışta tamamen siliniyor.)
      if (error instanceof Error && error.message === ABORT_ERROR) throw error;

      if (error instanceof RateLimitError) {
        rateLimitRetries++;
        if (rateLimitRetries <= MAX_RATE_LIMIT_RETRIES) {
          await runSmartCooldown(rateLimitRetries, onProgress, userMap.size, totalCount, error.retryAfter);
          skipNextDelay = true;
          continue;
        }
        // Denemeler tükendi — aşağıdaki ortak "kaydet ve zarifçe çık" yoluna düşülür.
        // DÜZELTME: Eskiden buradan DOĞRUDAN throw ediliyordu ve aşağıdaki saveCheckpoint'e
        // hiç ulaşılmıyordu; son checkpoint'ten sonra çekilen tüm sayfalar kayboluyordu.
      } else if (
        // DÜZELTME: client↔kendi sunucusu arası geçici ağ kopmaları (wifi blip, vb.) artık
        // hemen tüm akışı çökertmek yerine birkaç kez sessizce yeniden deneniyor. Sunucu
        // tarafındaki igRequest zaten Instagram'a giden isteği kendi içinde retry ediyor;
        // bu katman client'ın kendi sunucusuna ulaşamadığı ayrı durumu kapsıyor.
        error instanceof Error &&
        error.message === "NETWORK" &&
        networkRetries < CLIENT_NETWORK_RETRY_MAX
      ) {
        networkRetries++;
        await sleep(CLIENT_NETWORK_RETRY_DELAY_MS * networkRetries);
        skipNextDelay = true;
        continue;
      }

      // ── Ortak Zarif Çıkış ──────────────────────────────────────────────────
      // Buraya ulaşan her yol kalıcıdır: rate-limit denemeleri tükendi, oturum öldü,
      // ya da ağ denemeleri bitti. Hepsinde ÖNCE checkpoint yazılır, SONRA o ana kadar
      // toplanan veri hatanın üzerinde yukarı taşınır.
      const collected = Array.from(userMap.values());

      if (collected.length > 0) {
        await saveCheckpoint(checkpointKey, { users: collected, nextMaxId });
      }

      const reason: PartialDataError["reason"] =
        error instanceof RateLimitError
          ? "RATE_LIMIT"
          : error instanceof Error && error.message === "SESSION_INVALID"
            ? "SESSION_INVALID"
            : "UNKNOWN";

      throw new PartialDataError(
        reason === "RATE_LIMIT"
          ? `${label}: Hız sınırı aşıldı. ${collected.length} kişi çekildi.`
          : error instanceof Error
            ? error.message
            : `${label}: Bilinmeyen hata`,
        collected,
        reason
      );
    }
  }

  // TANILAMA: Instagram, talep ettiğimiz PAGE_SIZE'ı gerçekten karşılıyor mu?
  // PAGE_SIZE'ı düşürmenin istek sayısını (ve rate-limit maruziyetini) artırıp
  // artırmadığı ancak bu ölçümle bilinebilir:
  //   • Gözlenen maks ≈ PAGE_SIZE  → talep karşılanıyor, düşürmek istek sayısını KATLAR
  //   • Gözlenen maks « PAGE_SIZE  → zaten kırpılıyor, düşürmenin istek maliyeti YOK
  if (rawPageSizes.length > 0) {
    const toplam = rawPageSizes.reduce((a, b) => a + b, 0);
    clientLogger.audit(
      "sayfa-boyutu",
      `${label}: ${rawPageSizes.length} sayfa | talep=${PAGE_SIZE} | ` +
        `gözlenen maks=${Math.max(...rawPageSizes)} min=${Math.min(...rawPageSizes)} ` +
        `ort=${Math.round(toplam / rawPageSizes.length)}`,
      {
        label,
        sayfaSayisi: rawPageSizes.length,
        talep: PAGE_SIZE,
        maks: Math.max(...rawPageSizes),
        min: Math.min(...rawPageSizes),
      }
    );
  }

  // Tamamlandı — checkpoint temizle
  await clearCheckpoint(checkpointKey);

  return {
    users: Array.from(userMap.values()),
    pageCursors,
    pageSizes,
    rawPageSizes
  };
}

// ─── Eksik Veri Telafi Sonucu ─────────────────────────────────────────────────

/** Onarım sonrası hâlâ eksik kalan tek bir imleç */
export interface CursorDeficit {
  cursorIndex: number;
  /** Bu imleçte kaç kişinin hâlâ eksik olduğu — karantina bütçesini bu belirler */
  missing: number;
}

interface DeficitRetryResult {
  users: IgUser[];
  /**
   * Onarım sonrası HÂLÂ eksik olan ve sayfanın kırpıldığına dair KANIT bulunan imleçler.
   * Kör onarım hedefleri buraya dahil edilmez (bkz. blindSeeded).
   */
  remainingDeficits: CursorDeficit[];
  /** Her sayfanın `users` dizisindeki başlangıç indeksi */
  pageOffsets: number[];
  /** Her sayfadan diziye eklenen kişi sayısı */
  pageSizes: number[];
  /** Toplam sayfa (imleç) sayısı */
  totalPages: number;
}

// ─── Array-Based Deficit Tracking (Dizi Tabanlı Nokta Atışı Eksik Takibi) ───
async function runDeficitRetry(opts: {
  fetchPage: (maxId: string | null) => Promise<{ users: IgUser[]; nextMaxId: string | null }>;
  expectedCount: number;
  label: string;
  checkpointKey: string;
  onProgress?: (p: AnalysisProgress) => void;
}): Promise<DeficitRetryResult> {
  const { fetchPage, expectedCount, label, checkpointKey, onProgress } = opts;

  // ═══ MERKEZ MAP — Tüm turlar boyunca ASLA sıfırlanmaz ═══
  const masterMap = new Map<string, IgUser>();

  // Bir sayfadaki kullanıcıları merkez Map'e ekler, YENİ eklenen sayısını döner.
  const harvest = (users: IgUser[]): number => {
    let added = 0;
    for (const user of users) {
      const id = toSafeId(user);
      if (id && !masterMap.has(id)) {
        masterMap.set(id, user);
        added++;
        sessionFetchedCount++;
      }
    }
    return added;
  };

  // ─── Tur 1: İlk tam sayfalama ───────────────────────────────────────────
  let firstBatch;
  try {
    firstBatch = await runPaginationLoop({
      fetchPage,
      totalCount: expectedCount,
      label,
      checkpointKey,
      cumulativeMap: masterMap,
      onProgress,
    });
  } catch (error) {
    // masterMap referansı runPaginationLoop'a verildiği için toplanan veri BURADA da
    // duruyor. Kısmi veriyi tam haliyle yukarı taşı ki startAnalysis diske yazabilsin.
    if (error instanceof PartialDataError) {
      throw new PartialDataError(error.message, Array.from(masterMap.values()), error.reason);
    }
    throw error;
  }

  const pageCursors = firstBatch.pageCursors;
  const rawPageSizes = firstBatch.rawPageSizes;

  // Sayfa i'nin `users` dizisindeki başlangıç indeksini hesaplar (kümülatif toplam)
  const computePageOffsets = (): number[] => {
    const offsets: number[] = [];
    let acc = 0;
    for (const size of firstBatch.pageSizes) {
      offsets.push(acc);
      acc += size;
    }
    return offsets;
  };

  // Beklenen sayıyla karşılaştır — eksik yoksa direkt dön
  if (masterMap.size >= expectedCount || expectedCount === 0) {
    return {
      users: Array.from(masterMap.values()),
      remainingDeficits: [],
      pageOffsets: computePageOffsets(),
      pageSizes: firstBatch.pageSizes,
      totalPages: rawPageSizes.length,
    };
  }

  const deficit = expectedCount - masterMap.size;

  // DÜZELTME (doğruluk): Kıyas artık HAM sayfa boyutuyla yapılıyor.
  // Bir sayfa 100 kişi döndürüp bunların 30'u önceki sayfalarla çakışıyorsa o sayfa
  // KIRPILMAMIŞTIR. Eski kod dedup sonrası sayıyı (70) kullandığı için bu çakışmayı
  // "o imleçte 30 kişi eksik" diye okuyor ve aynı imleci 6 tura kadar boşuna yeniden
  // çekiyordu. Kırpılmanın tek güvenilir sinyali ham sayfa boyutudur.
  const MAX_PAGE_SIZE = Math.max(...rawPageSizes, 1);
  const cursorDeficits: number[] = [];
  const originalDeficits: number[] = [];
  // Log'da kanıt gösterebilmek için sayfa başına beklenen boyut saklanıyor
  const expectedPageSizes: number[] = [];

  for (let i = 0; i < rawPageSizes.length; i++) {
      let expectedPageSize = MAX_PAGE_SIZE;
      if (i === rawPageSizes.length - 1) {
          expectedPageSize = expectedCount % MAX_PAGE_SIZE;
          if (expectedPageSize === 0) expectedPageSize = MAX_PAGE_SIZE;
      }

      const missing = Math.max(0, expectedPageSize - rawPageSizes[i]);
      cursorDeficits.push(missing);
      originalDeficits.push(missing);
      expectedPageSizes.push(expectedPageSize);
  }

  // TEŞHİS: hangi sayfanın kısa geldiğini 1-TABANLI ve kanıtıyla yaz.
  // (Dizin 12 = 13. sayfa; log 0-tabanlı yazınca "yanlış imleçte arıyor" izlenimi doğuyordu.)
  const kisaSayfalar = originalDeficits
      .map((d, i) => ({ i, d }))
      .filter((x) => x.d > 0)
      .map((x) => `${x.i + 1}. sayfa (gelen ${rawPageSizes[x.i]}, beklenen ${expectedPageSizes[x.i]})`);

  if (kisaSayfalar.length > 0) {
      clientLogger.audit(
          "repair",
          `${label}: ${rawPageSizes.length} sayfadan kısa gelenler → ${kisaSayfalar.join(" · ")}`,
          { label, toplamSayfa: rawPageSizes.length, kisaSayfaSayisi: kisaSayfalar.length }
      );
  }

  // Güvenlik ağı: hiçbir sayfa kırpılmamış görünüyor ama toplamda hâlâ eksik var
  // (çakışma/kayma kaynaklı). Onarımı tamamen atlamak yerine imleçler arasından eşit
  // aralıklarla SINIRLI sayıda hedef seçilir — böylece eski koddaki "her imleci kovala"
  // davranışının istek maliyetine dönmeden kurtarma şansı korunur.
  // NOT: `every(d => d === 0)` yazılmıyor — TS 5.5+ bundan tip koruması çıkarıp diziyi
  // `0[]` olarak daraltıyor ve aşağıdaki atamayı reddediyor. `some` ile aynı mantık.
  //
  // KRİTİK: Kör seçilen imleçler ayrıca işaretlenir. Bu imleçlerde sayfanın kırpıldığına
  // dair HİÇBİR KANIT yoktur — sadece "toplamda eksik var, bir yerlere bakalım" denmiştir.
  // Karantina kararı bu imleçlere ASLA dayandırılmamalı: 8 kör imleç × geniş bant,
  // GT listesinin tamamını silmeye yeter.
  const blindSeeded = new Set<number>();

  // ORANTI KORUMASI: Kör onarım, hiçbir kanıt yokken imleçleri tarar ve hedef başına
  // 3 istek × 5 tur harcar. Saatlerce süren bir taramada 1-2 kişilik fark neredeyse
  // her zaman ORGANİK hareketliliktir (tarama sürerken birileri takipten çıkar) —
  // veri kaybı değil. Bu farkı kovalamak throttle'ı tetikleyen şeyin kendisi oluyordu.
  //
  // Kanıtlı eksikler (kırpılmış sayfalar) bu korumadan ETKİLENMEZ; onlar her zaman taranır.
  // Kalan fark yine kullanıcıya hata olarak bildirilir — sadece boşuna istek atılmaz.
  const blindRepairWorthwhile =
    deficit >= BLIND_REPAIR_MIN_DEFICIT ||
    deficit / Math.max(expectedCount, 1) >= BLIND_REPAIR_MIN_RATIO;

  if (!blindRepairWorthwhile) {
    clientLogger.debug(
      "repair",
      `${label}: ${deficit} kişilik fark organik hareketlilik kabul edildi, kör onarım atlandı ` +
        `(eşik: ${BLIND_REPAIR_MIN_DEFICIT} kişi veya %${(BLIND_REPAIR_MIN_RATIO * 100).toFixed(1)})`
    );
  }

  if (blindRepairWorthwhile && cursorDeficits.length > 0 && !cursorDeficits.some((d) => d > 0)) {
      const targetCount = Math.min(MAX_BLIND_REPAIR_CURSORS, cursorDeficits.length);
      const stride = cursorDeficits.length / targetCount;
      for (let n = 0; n < targetCount; n++) {
          const idx = Math.min(cursorDeficits.length - 1, Math.floor(n * stride));
          cursorDeficits[idx] = deficit;
          originalDeficits[idx] = deficit;
          blindSeeded.add(idx);
      }
  }

  onProgress?.({
    step: "repair",
    message: `${label}: ${deficit} kişi listeye eklenemedi, derinlemesine arama başlatılıyor...`,
    current: masterMap.size,
    total: expectedCount,
  });

  // Detaylı arama en fazla 5 tur tekrarlanır; 5. turun sonunda pes edilir.
  const MAX_RETRY_CYCLES = 5;
  let currentCycle = 0;
  let needsSecurityPass = false;
  // Onarım sırasında oturum GERÇEKTEN ölürse turları sürdürmenin anlamı yok —
  // ölü bir oturumu 5 tur boyunca dövmek sadece rate-limit baskısı üretir.
  let sessionDead = false;
  const consecutiveFailures: number[] = new Array(cursorDeficits.length).fill(0);

  // Onarım turlarının tamamı yavaşlatılmış tempoyla çalışır (bkz. withRepairPacing).
  await withRepairPacing(async () => {
  while (currentCycle < MAX_RETRY_CYCLES && !sessionDead && cursorDeficits.some(d => d > 0)) {
      currentCycle++;
      const currentDeficitSum = cursorDeficits.reduce((a, b) => a + b, 0);
      clientLogger.debug("repair", `${label}: Tur ${currentCycle}/${MAX_RETRY_CYCLES} başlıyor. Kalan eksik toplamı: ${currentDeficitSum}`);
      
      for (let i = 0; i < cursorDeficits.length; i++) {
          if (cursorDeficits[i] > 0) {
              // ÜÇLÜ ONARIM TARAMASI: Eksik veri gelen imlecin ETRAFI taranır —
              //   1. bir ÖNCEKİ imleç  (sayfa sınırı kaymışsa eksikler buraya düşmüş olabilir)
              //   2. imlecin KENDİSİ   (sayfa gerçekten kırpıldıysa tekrar denenir)
              //   3. bir SONRAKİ imleç (kayma diğer yöne olmuşsa)
              // Sıra liste düzenini takip eder. Uçlarda (ilk/son sayfa) olmayan komşu atlanır.
              const walkTargets: (string | null)[] = [];
              if (i > 0) walkTargets.push(pageCursors[i - 1]);
              walkTargets.push(pageCursors[i]);
              if (i + 1 < pageCursors.length) walkTargets.push(pageCursors[i + 1]);

              // 1-TABANLI etiket + hangi sayfaların çekildiği açıkça yazılıyor
              const hedefEtiketleri = [
                  ...(i > 0 ? [`${i}. sayfa`] : []),
                  `${i + 1}. sayfa ←eksik`,
                  ...(i + 1 < pageCursors.length ? [`${i + 2}. sayfa`] : []),
              ].join(" + ");

              clientLogger.debug(
                  "repair",
                  `${label}: ${i + 1}. sayfada ${cursorDeficits[i]} eksik ` +
                  `(gelen ${rawPageSizes[i]}, beklenen ${expectedPageSizes[i]}) → taranıyor: ${hedefEtiketleri}`
              );

              try {
                  let newlyAdded = 0;

                  for (const target of walkTargets) {
                      // Hedefe ulaşıldıysa kalan istekleri harcama
                      if (masterMap.size >= expectedCount) break;

                      // İNSAN HIZI: her istekten önce jitter (veya psikoloji molası)
                      await humanDelay();

                      const page = await fetchPage(target);
                      newlyAdded += harvest(page.users);
                  }

                  if (newlyAdded > 0) {
                      cursorDeficits[i] = Math.max(0, cursorDeficits[i] - newlyAdded);
                      consecutiveFailures[i] = 0; // Başarılı, sıfırla
                      
                      onProgress?.({
                          step: "repair",
                          message: `${label}: Detaylı taramada ${newlyAdded} kişi bulundu.. (${masterMap.size} / ${expectedCount})`,
                          current: masterMap.size,
                          total: expectedCount,
                      });
                  } else {
                      consecutiveFailures[i]++;
                      // Eşik MAX_RETRY_CYCLES'a bağlandı: turlar dolmadan erken pes edilmez.
                      // (Eski sabit 4 değeri, istenen 5 turluk taramayı 4. turda kesiyordu.)
                      if (consecutiveFailures[i] >= MAX_RETRY_CYCLES) {
                          clientLogger.debug("repair", `${label}: Kursor ${i} art arda ${MAX_RETRY_CYCLES} kere boş döndü, hayalet hesap kabul edildi`);
                          cursorDeficits[i] = 0; // Eksik sayısını 0 olarak güncelle
                      }
                  }
              } catch (error) {
                  // İPTAL: yut, yeniden fırlat — onarım turu derhal sonlanır
                  if (error instanceof Error && error.message === ABORT_ERROR) throw error;

                  if (error instanceof RateLimitError) {
                      clientLogger.warn("repair", `${label}: Hız sınırı (tur ${currentCycle}, indeks ${i}) — geri çekiliyor`);
                      await runSmartCooldown(currentCycle, onProgress, masterMap.size, expectedCount, error.retryAfter);
                  } else if (error instanceof Error && error.message === "SESSION_INVALID") {
                      // Oturum gerçekten öldü. Ana veri zaten toplandı; onarımı burada bitirip
                      // elimizdekiyle dönüyoruz — 5 tur boyunca ölü oturuma istek atmıyoruz.
                      clientLogger.error(
                          "repair",
                          `${label}: Oturum geçersiz — onarım turu durduruluyor (tur ${currentCycle}, indeks ${i})`,
                          clientErrorMeta(error)
                      );
                      onProgress?.({
                          step: "repair",
                          message: `${label}: Oturum geçersiz hale geldi, detaylı arama durduruldu. Toplanan veriler korundu.`,
                          current: masterMap.size,
                          total: expectedCount,
                      });
                      sessionDead = true;
                      break;
                  } else {
                      clientLogger.warn("repair", `${label}: Onarım hatası (tur ${currentCycle}, indeks ${i})`, clientErrorMeta(error));
                  }
              }

              if (masterMap.size >= expectedCount) {
                  needsSecurityPass = true;
                  cursorDeficits.fill(0); // Hedefe ulaştık, döngüyü kırmak için tüm eksikleri 0 yap
                  break;
              }
          }
      }
  }
  }); // withRepairPacing sonu

  // ─── Son Güvenlik Turu (Security Pass) ───────────────────────────────────
  // Oturum ölmüşse güvenlik turu da atlanır — hepsi hata dönerdi.
  if (needsSecurityPass && !sessionDead) {
    await withRepairPacing(async () => {
      clientLogger.debug("repair", `${label}: Hedefe ulaşıldı, son güvenlik turu başlıyor`);
      onProgress?.({
          step: "repair",
          message: `${label}: Listeler tamamlandı, son güvenlik doğrulaması yapılıyor...`,
          current: masterMap.size,
          total: expectedCount,
      });

      for (let i = 0; i < cursorDeficits.length; i++) {
          if (originalDeficits[i] > 0) {
              // Güvenlik turunda imlecin KENDİSİ yeniden çekilir. Komşuları ana onarım
              // döngüsü zaten 5 tur boyunca taradı; burada tek istek yeterli.
              const maxId = pageCursors[i];
          try {
              await humanDelay(); // İNSAN HIZI
              const page = await fetchPage(maxId);
              harvest(page.users);
          } catch (error) {
              if (error instanceof Error && error.message === ABORT_ERROR) throw error;
              clientLogger.warn("repair", `${label}: Güvenlik turu hatası (indeks ${i})`, clientErrorMeta(error));
          }
          }
      }
      
      clientLogger.debug("repair", `${label}: Son güvenlik turu tamamlandı`);
    });
  }

  const currentCount = masterMap.size;
  if (currentCount < expectedCount) {
      const newDeficit = expectedCount - currentCount;
      clientLogger.audit("repair", `${label}: ${MAX_RETRY_CYCLES} tur bitti, kalan ${newDeficit} hesap hayalet kabul edildi`, { label, newDeficit, bulunan: currentCount, beklenen: expectedCount });
      onProgress?.({
          step: "repair",
          message: `${label}: Kalan ${newDeficit} kişi dondurulmuş veya gizli hesap olarak tespit edildi.`,
          current: currentCount,
          total: expectedCount,
      });
  } else {
      clientLogger.audit("repair", `${label}: Hedef sayıya ulaşıldı (${currentCount}/${expectedCount})`, { label, bulunan: currentCount, beklenen: expectedCount });
      onProgress?.({
          step: "repair",
          message: `${label}: Detaylı arama tamamlandı (${currentCount}/${expectedCount} kişi bulundu)`,
          current: currentCount,
          total: expectedCount,
      });
  }

  // ─── Kalan eksikleri topla (Karantina Algoritması için) ───────────────────
  //
  // DÜZELTME (K4): Eskiden `originalDeficits` kullanılıyordu — bu, onarım ÖNCESİ
  // anlık görüntüdür ve hiç azalmaz. Sonuç: eksiği TAMAMEN kapatılmış bir imleç bile
  // karantina tetikliyordu. Artık onarım sonrası GERÇEKTEN kalan `cursorDeficits`
  // okunuyor.
  //
  // DÜZELTME (K5): Kör seçilen imleçler dışlanıyor — o imleçlerde sayfanın kırpıldığına
  // dair kanıt yok, dolayısıyla karantina kararına girmemeleri gerekir.
  const remainingDeficits: CursorDeficit[] = [];
  for (let i = 0; i < cursorDeficits.length; i++) {
    if (cursorDeficits[i] > 0 && !blindSeeded.has(i)) {
      remainingDeficits.push({ cursorIndex: i, missing: cursorDeficits[i] });
    }
  }

  return {
    users: Array.from(masterMap.values()),
    remainingDeficits,
    // pageSizes DEDUP SONRASI eklenen sayıyı tuttuğu için kümülatif toplamı
    // doğrudan `users` dizisindeki konumu verir.
    pageOffsets: computePageOffsets(),
    pageSizes: firstBatch.pageSizes,
    totalPages: rawPageSizes.length,
  };
}
// ─── GT Listesi Kesin Düzeltmesi ─────────────────────────────────────────────
//
// TASARIM KARARI: Konum modeli artık kimseyi listeden SİLMİYOR. Yalnızca hangi adayın
// ÖNCE doğrulanacağını belirliyor. Fark kritik:
//   • Silme kuralı olarak: model yanılırsa masum kişiler listeden çıkar (geri dönüşsüz hata)
//   • Sıralama olarak:     model yanılırsa sadece daha geç bulunur (sonuç yine doğru)
// Model artık yanlış sonuca sebep OLAMAZ, sadece hızı etkiler.
//
// Listeden çıkarma yalnızca Instagram'dan gelen KESİN doğrulamayla yapılır.

/** Doğrulama için harcanacak istek üst sınırı — eksik başına ve mutlak. */
const VERIFY_CHECKS_PER_MISSING = 10;
const VERIFY_MAX_CHECKS = 40;

/** Doğrulama butonunun sonradan çalışabilmesi için analiz sonunda diske yazılan künye */
export type GtDeficitMeta = {
  deficits: CursorDeficit[];
  pageOffsets: number[];
  pageSizes: number[];
  totalMissing: number;
  savedAt: string;
};

export type GtCorrectionResult = {
  /** Kesin olarak takipçi olduğu doğrulanan, GT listesinden çıkarılacak kişiler */
  confirmedFollowers: IgUser[];
  totalMissing: number;
  checksUsed: number;
  rho: number;
  sampleSize: number;
  modelUsable: boolean;
  reason: string;
};

/**
 * GT listesindeki yalancı pozitifleri Instagram'a tek tek sorarak KESİN olarak temizler.
 *
 * `deficit` kadar onay bulununca durur — matematiksel olarak daha fazla hatalı kayıt olamaz.
 * Doğrulama başarısız/sonuçsuz olursa kişi listede BIRAKILIR (fail-safe).
 */
async function correctGtList(opts: {
  followers: IgUser[];
  following: IgUser[];
  notFollowers: IgUser[];
  deficits: CursorDeficit[];
  pageOffsets: number[];
  pageSizes: number[];
  userId: string;
  sessionId: string;
  onProgress?: (p: AnalysisProgress) => void;
}): Promise<GtCorrectionResult> {
  const {
    followers, following, notFollowers, deficits,
    pageOffsets, pageSizes, userId, sessionId, onProgress,
  } = opts;

  const totalMissing = deficits.reduce((sum, d) => sum + d.missing, 0);

  const base: GtCorrectionResult = {
    confirmedFollowers: [],
    totalMissing,
    checksUsed: 0,
    rho: 0,
    sampleSize: 0,
    modelUsable: false,
    reason: "eksik yok",
  };

  if (totalMissing === 0 || notFollowers.length === 0) return base;

  // ─── 1. Konum ilişkisini ÖLÇ (yalnızca sıralama için) ───────────────────
  const model = buildPositionModel(followers, following);
  base.rho = model.rho;
  base.sampleSize = model.sampleSize;
  base.modelUsable = model.usable;

  clientLogger.audit(
    "siralama-korelasyonu",
    `Takipçi↔Takip sıra ilişkisi: ρ=${model.rho.toFixed(3)} | örneklem=${model.sampleSize} | ` +
      `kullanılabilir=${model.usable ? "evet" : "hayır"} (${model.reason})`,
    { rho: model.rho, orneklem: model.sampleSize, kullanilabilir: model.usable }
  );

  // ─── 2. Adayları şüphe sırasına diz ──────────────────────────────────────
  // Model kullanılabilirse tahmin merkezine yakınlık; değilse liste sırası.
  // Model çalışmasa bile doğrulama YAPILIR — sadece sıra optimize edilmemiş olur.
  const followingIdx = new Map<string, number>();
  for (let i = 0; i < following.length; i++) {
    const id = toSafeId(following[i]);
    if (id && !followingIdx.has(id)) followingIdx.set(id, i);
  }

  const centers: number[] = [];
  if (model.usable) {
    for (const d of deficits) {
      const pageStart = pageOffsets[d.cursorIndex] ?? 0;
      const pageEnd = pageStart + (pageSizes[d.cursorIndex] ?? 0);
      const w = predictFollowingWindow(model, pageStart, pageEnd);
      if (w) centers.push(w.center);
    }
  }

  const scored = notFollowers.map((user) => {
    const id = toSafeId(user) ?? "";
    const idx = followingIdx.get(id) ?? Number.MAX_SAFE_INTEGER / 2;
    const distance = centers.length > 0
      ? Math.min(...centers.map((c) => Math.abs(idx - c)))
      : idx;
    return { user, distance };
  });

  scored.sort((a, b) => a.distance - b.distance);

  // ─── 3. Sırayla KESİN doğrula, deficit kadar onay bulunca dur ───────────
  const maxChecks = Math.min(totalMissing * VERIFY_CHECKS_PER_MISSING, VERIFY_MAX_CHECKS, scored.length);
  const confirmed: IgUser[] = [];
  let checksUsed = 0;

  onProgress?.({
    step: "repair",
    message: `${totalMissing} eksik kayıt için GT listesi doğrulanıyor (en fazla ${maxChecks} kontrol)...`,
  });

  for (const { user } of scored) {
    if (confirmed.length >= totalMissing || checksUsed >= maxChecks) break;

    await humanDelay(); // İnsan hızı korunuyor
    checksUsed++;

    try {
      const res = await fetch("/api/ig/verify-follower", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sessionId, username: user.username, expectedId: user.id }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });

      if (res.status === 429) {
        // Hız sınırı — doğrulamayı burada bitir, elde olanı koru
        clientLogger.warn("gt-duzeltme", "Hız sınırı nedeniyle doğrulama erken sonlandırıldı");
        break;
      }
      if (res.status === 401) {
        clientLogger.warn("gt-duzeltme", "Oturum geçersiz — doğrulama sonlandırıldı");
        break;
      }
      if (!res.ok) continue; // Sonuçsuz → kişi listede kalır

      const data = await res.json().catch(() => ({}));
      if (data.isFollower === true) {
        confirmed.push(user);
        onProgress?.({
          step: "repair",
          message: `GT düzeltmesi: @${user.username} aslında geri takip ediyor, listeden çıkarıldı (${confirmed.length}/${totalMissing}).`,
        });
      }
    } catch {
      // Ağ hatası → SONUÇSUZ, kişi listede bırakılır (fail-safe)
    }
  }

  return {
    ...base,
    confirmedFollowers: confirmed,
    checksUsed,
    reason: model.usable ? model.reason : `${model.reason} — adaylar liste sırasıyla denendi`,
  };
}

// ─── Bağımsız GT Doğrulaması (Kullanıcı Tetikli) ─────────────────────────────
//
// Analiz akışından TAMAMEN AYRI çalışır. Sebebi: doğrulama isteklerini taramanın
// hemen ardına eklemek, hesabın throttle eşiğine en yakın olduğu ana onlarca istek
// daha bindirmek demekti. Ayrı çalıştırıldığında:
//   • Tarama sırasında sıfır ek istek → throttle riski artmıyor
//   • Taze jitter durumu → tempo ilk kademeden başlıyor, daha hızlı bitiyor
//   • Kullanıcı hesabı 401 yediyse butona basmayıp bekleyebiliyor

/** Analiz bitiminden sonra doğrulama butonunun aktifleşmesi için beklenecek süre. */
export const GT_VERIFY_COOLDOWN_MS = 30 * 60 * 1000; // 30 dakika

export type VerifyGtOutcome = {
  status: "ok" | "no_deficit" | "no_data";
  corrected: number;
  remaining: number;
  checksUsed: number;
};

export async function verifyGtList(
  sessionId: string,
  userId: string,
  email: string,
  targetUsername: string,
  onProgress?: (p: AnalysisProgress) => void
): Promise<VerifyGtOutcome> {
  const locked = await acquireAnalysisLock("main");
  if (!locked) throw new Error("ANALYSIS_ALREADY_RUNNING");

  // Taze tempo: doğrulama dinlenmiş hesapta çalıştığı için ilk kademeden başlar.
  resetJitterState();
  clearAnalysisAbort();
  setPauseReporter(onProgress);

  const prefix = `${email}_${targetUsername}_`;

  try {
    const [followers, following, notFollowers, meta] = await Promise.all([
      loadAnalysisPayload<IgUser[]>(`${prefix}followers`),
      loadAnalysisPayload<IgUser[]>(`${prefix}following`),
      loadAnalysisPayload<IgUser[]>(`${prefix}notfollowers`),
      loadAnalysisPayload<GtDeficitMeta>(`${prefix}gtDeficitMeta`),
    ]);

    if (!followers?.length || !following?.length || !notFollowers?.length || !meta) {
      return { status: "no_data", corrected: 0, remaining: 0, checksUsed: 0 };
    }

    if (!meta.totalMissing || meta.totalMissing <= 0) {
      return { status: "no_deficit", corrected: 0, remaining: 0, checksUsed: 0 };
    }

    // Doğrulama da molalar veriyor — onlarda da örtü trafiği çalışsın
    const decoyPool: string[] = [targetUsername];
    for (let i = 0; i < Math.min(20, followers.length); i++) {
      const u = followers[Math.floor(Math.random() * followers.length)];
      if (u?.username) decoyPool.push(u.username);
    }
    setDecoyRunner(async () => {
      await enforceRequestBudget();
      const name = decoyPool[Math.floor(Math.random() * decoyPool.length)];
      if (!name) return;
      clientLogger.debug("mola-aktivitesi", `Profil görüntüleniyor: @${name}`);
      await fetch("/api/ig/get-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, sessionId }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
    });

    // Doğrulama da onarım temposuyla çalışır — ekstra temkin
    const correction = await withRepairPacing(() =>
      correctGtList({
        followers,
        following,
        notFollowers,
        deficits: meta.deficits,
        pageOffsets: meta.pageOffsets,
        pageSizes: meta.pageSizes,
        userId,
        sessionId,
        onProgress,
      })
    );

    const corrected = correction.confirmedFollowers.length;
    const remaining = Math.max(0, correction.totalMissing - corrected);

    if (corrected > 0) {
      // Doğrulananlar gerçek takipçidir: takipçi listesine eklenir ve tüm türetilen
      // listeler yeniden hesaplanır ki istatistikler tutarlı kalsın.
      const updatedFollowers = [...followers, ...correction.confirmedFollowers];
      const recomputed = runFullAnalysis(updatedFollowers, following, { silent: true });

      await saveAnalysisPayloadBatch({
        [`${prefix}followers`]: updatedFollowers,
        [`${prefix}notfollowers`]: recomputed.notFollowers,
        [`${prefix}unfollowing`]: recomputed.unfollowing,
        // Künye güncellenir: düzeltilen kadar eksik azalır, buton tekrar çalışabilir
        [`${prefix}gtDeficitMeta`]: { ...meta, totalMissing: remaining } satisfies GtDeficitMeta,
      });
    }

    clientLogger.audit(
      "gt-duzeltme",
      `Kullanıcı tetikli doğrulama — ${correction.totalMissing} eksik kayıttan ${corrected} tanesi ` +
        `kesin doğrulanıp listeden çıkarıldı, ${remaining} kayıt doğrulanamadı (${correction.checksUsed} kontrol)`,
      {
        eksik: correction.totalMissing,
        duzeltilen: corrected,
        kalan: remaining,
        kontrol: correction.checksUsed,
        rho: correction.rho,
        modelKullanildi: correction.modelUsable,
      }
    );

    return { status: "ok", corrected, remaining, checksUsed: correction.checksUsed };
  } finally {
    setPauseReporter(undefined);
    setDecoyRunner(undefined);
    void clientLogger.flush();
    await releaseAnalysisLock("main");
  }
}

// ─── Ölü Session Erken Uyarı (Ping) ──────────────────────────────────────────
// Analiz döngüsü başlamadan VE token kesilmeden önce oturumun canlı olduğunu doğrular.
//
// Sonuç üç durumludur. "indeterminate" (429, 503, 5xx, timeout) durumunda analiz
// ENGELLENMEZ: geçerli oturumu olan bir kullanıcıyı geçici bir ağ sorunu yüzünden
// durdurmak, token kaybından daha kötü bir deneyimdir. Sadece KESİN 401/403 yanıtı
// "dead" sayılır.
//
// NOT: Bu fonksiyon bağımsızdır — runPaginationLoop, runDeficitRetry veya
// startAnalysis içinden çağrılmaz; veri çekme döngüsünün davranışını etkilemez.
const PING_TIMEOUT_MS = 12_000; // Sunucu tarafındaki 10s'lik sınırın biraz üstünde

export type SessionPingResult = "alive" | "dead" | "indeterminate";

export async function pingSessionAlive(sessionId: string): Promise<SessionPingResult> {
  try {
    const res = await fetch("/api/ig/verify-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });

    if (res.ok) return "alive";
    if (res.status === 401 || res.status === 403) return "dead";
    return "indeterminate";
  } catch {
    return "indeterminate";
  }
}

// ─── Ana Analiz Orkestratörü ──────────────────────────────────────────────────

/**
 * Python'daki main() fonksiyonunun tam karşılığı:
 *   1. get_user_id(target_username, headers) → user_id
 *   2. fetch_followers(user_id, headers) → followers set
 *   3. fetch_following(user_id, headers) → following set
 *   4. compare_follow_lists(followers, following) → result
 */
export async function startAnalysis(
  sessionId: string,
  userId: string,
  targetUsername: string,
  email: string,
  onProgress?: (p: AnalysisProgress) => void
) {
  // Aşama 4: Paralel tetikleme engeli
  const locked = await acquireAnalysisLock("main");
  if (!locked) {
    throw new Error("ANALYSIS_ALREADY_RUNNING");
  }

  resetJitterState();
  clearAnalysisAbort(); // Onceki oturumdan kalan iptal bayragi tasinmasin
  // Uzun molalar sırasında arayüzün sessiz kalmaması için bildirim kanalını kur
  setPauseReporter(onProgress);

  // ─── Mola Aktivitesi ────────────────────────────────────────────────────
  // Molalarda boş beklemek yerine bir profile göz atılır. Başlangıçta hedefin
  // kendi profili (bir kullanıcının en doğal yapacağı şey); takipçiler çekildikten
  // sonra havuz listeden rastgele isimlerle zenginleştirilir.
  const decoyPool: string[] = [targetUsername];

  setDecoyRunner(async () => {
    await enforceRequestBudget(); // örtü trafiği de bütçeye sayılır
    const name = decoyPool[Math.floor(Math.random() * decoyPool.length)];
    if (!name) return;
    clientLogger.debug("mola-aktivitesi", `Profil görüntüleniyor: @${name}`);
    await fetch("/api/ig/get-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, sessionId }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  });

  const analysisStartedAt = Date.now();
  clientLogger.audit("analiz", `Analiz başlatıldı — hedef: ${targetUsername}`, {
    hedef: targetUsername,
    sayfaBoyutu: PAGE_SIZE,
  });

  try {
    // Adım 1: Profil bilgilerini al (Python: get_user_id + ek bilgi)
    onProgress?.({ step: "precheck", message: "Hedef hesap bilgileri kontrol ediliyor..." });

    const res = await fetch("/api/ig/get-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: targetUsername, sessionId }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error("Profil bilgisi alınamadı. Session veya hedef hesabı kontrol edin.");
    }

    const profile = await res.json();
    const expectedFollowers = profile.followersCount ?? profile.expectedFollowers ?? 0;
    const expectedFollowing = profile.followingCount ?? profile.expectedFollowing ?? 0;

    await humanDelay();

    // Adım 2: Takipçileri çek (Python: fetch_followers)
    onProgress?.({
      step: "fetching",
      message: `Takipçilerin listesi toplanıyor... (0/${expectedFollowers} kişi)`,
      current: 0,
      total: expectedFollowers,
    });

    // GRACEFUL SHUTDOWN: prefix kısmi kayıtlarda da gerektiği için yukarı alındı.
    const prefix = `${email}_${targetUsername}_`;

    // Yarıda kesilen taramada o ana kadarki veriyi diske yazar ve fırlatılacak hatayı üretir.
    // analysisComplete:false verinin EKSİK olduğunu işaretler — tam tarama bunu true yapar.
    const saveAndBuildPauseError = async (
      err: PartialDataError,
      partialFollowers: IgUser[],
      partialFollowing: IgUser[] | null
    ): Promise<Error> => {
      const payload: Record<string, unknown> = {
        [`${prefix}followers`]: partialFollowers,
        [`${prefix}analysisComplete`]: false,
      };

      // following SADECE o aşamaya gelindiyse yazılır. Aksi halde önceki tam taramanın
      // takip listesi boş bir diziyle ezilirdi.
      if (partialFollowing !== null) {
        payload[`${prefix}following`] = partialFollowing;
      }

      await saveAnalysisPayloadBatch(payload);

      const recovered = partialFollowers.length + (partialFollowing?.length ?? 0);
      onProgress?.({
        step: "error",
        message:
          err.reason === "RATE_LIMIT"
            ? `Instagram hız sınırı nedeniyle duraklatıldı. ${recovered} kayıt korundu.`
            : err.message,
      });

      return new Error(err.reason === "RATE_LIMIT" ? "PAUSED_RATE_LIMIT" : err.message);
    };

    let followers: IgUser[];
    let followerDeficits: CursorDeficit[] = [];
    let followerPageOffsets: number[] = [];
    let followerPageSizes: number[] = [];
    try {
      const followersResult = await runDeficitRetry({
        fetchPage: (maxId) =>
          callPaginatedApi("/api/ig/followers", { userId, sessionId, maxId }),
        expectedCount: expectedFollowers,
        label: "Takipçiler",
        // DÜZELTME: sabit "followers" key'i hedef hesaba göre scope'lanmamıştı — hedef hesap
        // değiştirilip önceki analiz checkpoint bırakacak şekilde kesilirse, yeni analiz eski
        // hesabın checkpoint'ini "devam" diye yükleyip iki hesabın verisini karıştırabilirdi.
        checkpointKey: `followers_${userId}`,
        onProgress,
      });
      followers = followersResult.users;
      followerDeficits = followersResult.remainingDeficits;
      followerPageOffsets = followersResult.pageOffsets;
      followerPageSizes = followersResult.pageSizes;
    } catch (error) {
      if (error instanceof PartialDataError) {
        throw await saveAndBuildPauseError(error, error.partial, null);
      }
      throw error;
    }

    // Mola aktivitesi havuzunu zenginleştir: bundan sonraki molalarda gerçekten
    // listeden birine bakılır — "bu kim?" diye profile girmek en doğal davranış.
    for (let i = 0; i < Math.min(20, followers.length); i++) {
      const u = followers[Math.floor(Math.random() * followers.length)];
      if (u?.username) decoyPool.push(u.username);
    }

    // ARA KAYIT: Takipçiler tamamlandı. Bundan sonraki aşamada 429 veya oturum ölümü
    // yaşanırsa bu liste bellekte kaybolurdu — üstelik runPaginationLoop başarıyla
    // bittiği için checkpoint'ini de temizlemiş olur. Şimdi diske yazıyoruz.
    await saveAnalysisPayloadBatch({
      [`${prefix}followers`]: followers,
      [`${prefix}analysisComplete`]: false,
    });

    await humanDelay();

    // Adım 3: Takip edilenleri çek (Python: fetch_following)
    onProgress?.({
      step: "fetching",
      message: `Takip ettiklerinin listesi toplanıyor... (0/${expectedFollowing} kişi)`,
      current: 0,
      total: expectedFollowing,
    });

    let following: IgUser[];
    try {
      const followingResult = await runDeficitRetry({
        fetchPage: (maxId) =>
          callPaginatedApi("/api/ig/following", { userId, sessionId, maxId }),
        expectedCount: expectedFollowing,
        label: "Takip Edilenler",
        checkpointKey: `following_${userId}`,
        onProgress,
      });
      following = followingResult.users;
    } catch (error) {
      // Bu aşamada takipçi listesi ZATEN elimizde — eskiden burada her şey kaybediliyordu.
      if (error instanceof PartialDataError) {
        throw await saveAndBuildPauseError(error, followers, error.partial);
      }
      throw error;
    }

    // Adım 4: Hash Map analizi (Python: compare_follow_lists)
    onProgress?.({ step: "analyzing", message: "Listeler birbirleriyle karşılaştırılıyor..." });

    const { notFollowers, unfollowing, stats } = runFullAnalysis(followers, following);

    // ─── GT Doğrulaması TARAMA SIRASINDA ÇALIŞTIRILMAZ ──────────────────────
    //
    // Doğrulama, analizin hemen ardından çalıştırıldığında hesabın EN SICAK anına
    // onlarca istek daha eklerdi — gerçek loglarda 401 tam bu noktada geliyordu.
    // Bunun yerine gerekli künye diske yazılıyor; kullanıcı hesap dinlendikten sonra
    // "Doğrula" butonuyla ayrıca çalıştırıyor (bkz. verifyGtList).
    const totalMissing = followerDeficits.reduce((sum, d) => sum + d.missing, 0);

    if (totalMissing > 0) {
      clientLogger.audit(
        "gt-duzeltme",
        `${totalMissing} eksik kayıt tespit edildi — doğrulama kullanıcı onayına bırakıldı`,
        { eksik: totalMissing, imlecSayisi: followerDeficits.length }
      );

      onProgress?.({
        step: "repair",
        message: `Uyarı: ${totalMissing} kişi takipçi listesinden çekilemedi. "Geri Takip Etmeyenler" listesinde en fazla ${totalMissing} kayıt hatalı olabilir — hesabınız dinlendikten sonra «GT Listesini Doğrula» ile kesin düzeltme yapabilirsiniz.`,
      });
    }

    const now = new Date().toISOString();
    const profileStats = {
      followersCount: stats.dedupFollowers,
      followingCount: stats.dedupFollowing,
      expectedFollowers,
      expectedFollowing,
    };

    // prefix yukarıda tanımlandı (kısmi kayıtlar da kullanıyor)
    await saveAnalysisPayloadBatch({
      [`${prefix}followers`]: followers,
      [`${prefix}following`]: following,
      [`${prefix}notfollowers`]: notFollowers,
      [`${prefix}unfollowing`]: unfollowing,
      [`${prefix}profileStats`]: profileStats,
      [`${prefix}lastAnalysisAt`]: now,
      [`${prefix}analysisComplete`]: true,
      // Doğrulama butonunun sonradan çalışabilmesi için gereken künye
      [`${prefix}gtDeficitMeta`]: {
        deficits: followerDeficits,
        pageOffsets: followerPageOffsets,
        pageSizes: followerPageSizes,
        totalMissing,
        savedAt: now,
      } satisfies GtDeficitMeta,
    });

    onProgress?.({
      step: "complete",
      message: "Analiz başarıyla tamamlandı! ✓",
      current: followers.length + following.length,
      total: followers.length + following.length,
    });

    clientLogger.audit(
      "analiz",
      `Analiz tamamlandı — ${followers.length} takipçi, ${following.length} takip (${Math.round((Date.now() - analysisStartedAt) / 1000)} sn)`,
      {
        hedef: targetUsername,
        takipci: followers.length,
        beklenenTakipci: expectedFollowers,
        takip: following.length,
        beklenenTakip: expectedFollowing,
        sureSn: Math.round((Date.now() - analysisStartedAt) / 1000),
      }
    );

    return { followers, following, notFollowers, unfollowing, profileStats, lastAnalysisAt: now };
  } finally {
    setPauseReporter(undefined);
    setDecoyRunner(undefined);
    // Analiz bitti — bekleyen log kayıtlarını beklemeden sunucuya gönder
    void clientLogger.flush();
    // Aşama 4: Kilidi her durumda serbest bırak
    await releaseAnalysisLock("main");
  }
}

export async function loadStoredAnalysis(email: string, targetUsername: string): Promise<StoredAnalysis> {
  const prefix = `${email}_${targetUsername}_`;
  const [followers, following, notFollowers, unfollowing, profileStats, lastAnalysisAt, analysisComplete, ignoredIds, gtMeta] =
    await Promise.all([
      loadAnalysisPayload<IgUser[]>(`${prefix}followers`),
      loadAnalysisPayload<IgUser[]>(`${prefix}following`),
      loadAnalysisPayload<IgUser[]>(`${prefix}notfollowers`),
      loadAnalysisPayload<IgUser[]>(`${prefix}unfollowing`),
      loadAnalysisPayload<StoredAnalysis["profileStats"]>(`${prefix}profileStats`),
      loadAnalysisPayload<string>(`${prefix}lastAnalysisAt`),
      loadAnalysisPayload<boolean>(`${prefix}analysisComplete`),
      loadAnalysisPayload<string[]>(`${prefix}ignoredIds`),
      loadAnalysisPayload<GtDeficitMeta>(`${prefix}gtDeficitMeta`),
    ]);

  let resolvedNot = notFollowers ?? [];
  let resolvedUnf = unfollowing ?? [];

  // notFollowers ve unfollowing zaten kaydedilmişse yeniden hesaplama
  // Sadece IDB'de eksik olduğunda (eski veri) recalculate et
  if ((!notFollowers || !unfollowing) && followers?.length && following?.length) {
    const fresh = runFullAnalysis(followers, following, { silent: true });
    resolvedNot = fresh.notFollowers;
    resolvedUnf = fresh.unfollowing;
  }

  return {
    followers: followers ?? [],
    following: following ?? [],
    notFollowers: resolvedNot,
    unfollowing: resolvedUnf,
    lastAnalysisAt: lastAnalysisAt ?? null,
    profileStats: profileStats ?? null,
    // Eski kayıtlarda bu anahtar hiç yazılmamış olabilir. Veri varsa "tam" kabul edilir —
    // aksi halde mevcut kullanıcıların geçmiş analizleri eksik gibi görünürdü.
    analysisComplete: analysisComplete ?? true,
    ignoredIds: ignoredIds ?? [],
    gtMissingCount: gtMeta?.totalMissing ?? 0,
  };
}

/** Kullanıcının "yok say" seçimlerini kalıcı olarak saklar. */
export async function saveIgnoredIds(
  email: string,
  targetUsername: string,
  ignoredIds: string[]
): Promise<void> {
  await saveAnalysisPayload(`${email}_${targetUsername}_ignoredIds`, ignoredIds);
}

// ─── Hayalet Takipçi (Ghost Followers) Orkestrasyon ───────────────────────────

export type StoredGhostAnalysis = {
  likers: IgUser[];
  ghostFollowers: IgUser[];
  secretAdmirers: IgUser[];
  mediaId: string | null;
  lastGhostAnalysisAt: string | null;
};

/**
 * Ghost Followers analiz orkestratörü:
 *   1. Son postu tespit et
 *   2. Beğenenleri çek (deficit retry ile)
 *   3. followers vs likers Hash Map karşılaştırması
 *   4. IndexedDB'ye kaydet
 */
export async function startGhostAnalysis(
  sessionId: string,
  userId: string,
  followers: IgUser[],
  email: string,
  targetUsername: string,
  onProgress?: (p: AnalysisProgress) => void
): Promise<{ likers: IgUser[]; ghostFollowers: IgUser[]; secretAdmirers: IgUser[]; mediaId: string }> {
  // Aşama 4: Paralel tetikleme engeli
  const locked = await acquireAnalysisLock("ghost");
  if (!locked) {
    throw new Error("ANALYSIS_ALREADY_RUNNING");
  }

  // NOT: resetJitterState() burada BİLEREK çağrılmıyor. Hayalet analizi genellikle ana
  // analizin hemen ardından çalışır; hesap o noktada zaten yüzlerce istek atmış olur.
  // Sayacı sıfırlamak, tempo profilini en hızlı kademeye geri döndürüp tam da riskin
  // en yüksek olduğu anda hızlanmak anlamına gelirdi.

  setPauseReporter(onProgress);

  try {
    // Adım 1: Son postu tespit et
    onProgress?.({ step: "ghost-precheck", message: "Son gönderi aranıyor..." });

    const mediaRes = await fetch("/api/ig/latest-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, sessionId }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });

    if (!mediaRes.ok) {
      const errData = await mediaRes.json().catch(() => ({}));
      if (errData.code === "NO_POSTS") {
        throw new Error("GHOST_NO_POSTS");
      }
      throw new Error("Son post bilgisi alınamadı.");
    }

    const mediaData = await mediaRes.json();
    const mediaId = String(mediaData.mediaId);

    await humanDelay();

    // Adım 2: Beğenenleri çek
    onProgress?.({
      step: "fetching",
      message: "Son gönderiye beğeni bırakanlar taranıyor...",
      current: 0,
      total: 0,
    });

    const likersResult = await runDeficitRetry({
      fetchPage: (maxId) =>
        callPaginatedApi("/api/ig/likers", { mediaId, sessionId, maxId }),
      expectedCount: 0, // Likers için beklenen sayı bilinmiyor
      label: "Beğenenler",
      // DÜZELTME: mediaId'ye scope'landı — farklı bir post analiz edilirken önceki postun
      // yarım kalmış likers checkpoint'i yanlışlıkla "devam" olarak yüklenmesin.
      checkpointKey: `likers_${mediaId}`,
      onProgress,
    });
    const likers = likersResult.users;

    // Adım 3: Hash Map karşılaştırması
    onProgress?.({ step: "analyzing", message: "Hayalet takipçiler tespit ediliyor..." });

    const { ghostFollowers, secretAdmirers } = runGhostAnalysis(followers, likers);

    // Adım 4: IndexedDB'ye kaydet
    const now = new Date().toISOString();
    const prefix = `${email}_${targetUsername}_`;
    await saveAnalysisPayloadBatch({
      [`${prefix}likers`]: likers,
      [`${prefix}ghostFollowers`]: ghostFollowers,
      [`${prefix}secretAdmirers`]: secretAdmirers,
      [`${prefix}ghostMediaId`]: mediaId,
      [`${prefix}lastGhostAnalysisAt`]: now,
    });

    return { likers, ghostFollowers, secretAdmirers, mediaId };
  } finally {
    setPauseReporter(undefined);
    // Aşama 4: Kilidi her durumda serbest bırak
    await releaseAnalysisLock("ghost");
  }
}

export async function loadStoredGhostAnalysis(email: string, targetUsername: string): Promise<StoredGhostAnalysis> {
  const prefix = `${email}_${targetUsername}_`;
  const [likers, ghostFollowers, secretAdmirers, mediaId, lastGhostAnalysisAt] =
    await Promise.all([
      loadAnalysisPayload<IgUser[]>(`${prefix}likers`),
      loadAnalysisPayload<IgUser[]>(`${prefix}ghostFollowers`),
      loadAnalysisPayload<IgUser[]>(`${prefix}secretAdmirers`),
      loadAnalysisPayload<string>(`${prefix}ghostMediaId`),
      loadAnalysisPayload<string>(`${prefix}lastGhostAnalysisAt`),
    ]);

  return {
    likers: likers ?? [],
    ghostFollowers: ghostFollowers ?? [],
    secretAdmirers: secretAdmirers ?? [],
    mediaId: mediaId ?? null,
    lastGhostAnalysisAt: lastGhostAnalysisAt ?? null,
  };
}
