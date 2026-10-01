"use client";

/**
 * Tarayıcı Tarafı Logger
 *
 * NEDEN AYRI BİR MODÜL: Analiz döngüsünün tamamı (instagramClient.ts) tarayıcıda
 * çalışır ve tarayıcı dosya sistemine yazamaz. Bu yüzden en değerli loglar —
 * rate limit olayları, oturum ölümleri, sayfalama hataları — hiçbir zaman
 * system.log'a ulaşamıyordu. Bu modül onları toplayıp sunucuya taşır.
 *
 * Tasarım ilkeleri:
 *   1. LOGLAMA ASLA ANALİZİ BOZMAZ. Tüm gönderim hataları sessizce yutulur.
 *   2. Sunucuya SADECE warn/error taşınır. debug/info yalnızca development
 *      konsolunda kalır — her sayfa isteğini logla sunucuya taşımak anlamsız trafik olurdu.
 *   3. Gönderimler toplu (batch) yapılır: analiz sırasında saniyede birden fazla
 *      log üretilebilir, her biri için ayrı istek atmak veri çekme döngüsüyle
 *      bant genişliği için yarışırdı.
 *   4. Sekme kapanırken bekleyen kayıtlar sendBeacon ile kurtarılır.
 */

export type ClientLogLevel = "debug" | "info" | "warn" | "error";

type PendingEntry = {
  level: ClientLogLevel;
  scope: string;
  message: string;
  meta?: unknown;
  at: string;
};

const IS_DEV = process.env.NODE_ENV !== "production";

/** Sunucuya taşınacak seviyeler. */
const SHIPPED_LEVELS: ReadonlySet<ClientLogLevel> = new Set<ClientLogLevel>(["warn", "error"]);

const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_AT_COUNT = 20;
/** Tampon bu sayıyı aşarsa en eskiler düşürülür — bellek sızıntısı olmasın. */
const MAX_BUFFER = 200;

let buffer: PendingEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let unloadHookInstalled = false;

function authHeader(): Record<string, string> {
  try {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function installUnloadHook(): void {
  if (unloadHookInstalled || typeof window === "undefined") return;
  unloadHookInstalled = true;

  // Sekme kapanırken normal fetch iptal edilir; sendBeacon bu durumda da teslim eder.
  window.addEventListener("pagehide", () => {
    if (buffer.length === 0) return;
    try {
      const payload = JSON.stringify({ entries: buffer });
      navigator.sendBeacon?.("/api/log", new Blob([payload], { type: "application/json" }));
      buffer = [];
    } catch {
      /* teslim edilemezse sessizce vazgeç */
    }
  });
}

async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;

  const entries = buffer;
  buffer = [];

  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ entries }),
      keepalive: true,
    });
  } catch {
    // Gönderim başarısız — logları KASITLI olarak geri koymuyoruz. Ağ zaten
    // sorunluysa büyüyen bir kuyruk, asıl analiz isteklerine engel olurdu.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
}

function enqueue(level: ClientLogLevel, scope: string, message: string, meta?: unknown, forceShip = false): void {
  if (!forceShip && !SHIPPED_LEVELS.has(level)) return;

  installUnloadHook();

  buffer.push({ level, scope, message, meta, at: new Date().toISOString() });
  if (buffer.length > MAX_BUFFER) {
    buffer = buffer.slice(-MAX_BUFFER);
  }

  if (buffer.length >= FLUSH_AT_COUNT) {
    void flush();
  } else {
    scheduleFlush();
  }
}

function write(
  level: ClientLogLevel,
  scope: string,
  message: string,
  meta?: unknown,
  forceShip = false
): void {
  if (IS_DEV) {
    const line = `[${scope}] ${message}`;
    if (level === "error") console.error(line, meta ?? "");
    else if (level === "warn") console.warn(line, meta ?? "");
    else console.log(line, meta ?? "");
  }

  enqueue(level, scope, message, meta, forceShip);
}

export const clientLogger = {
  debug: (scope: string, message: string, meta?: unknown) => write("debug", scope, message, meta),
  info: (scope: string, message: string, meta?: unknown) => write("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => write("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => write("error", scope, message, meta),
  /**
   * KRİTİK ADIM kaydı — info seviyesinde ama seviyeden bağımsız olarak sunucuya taşınır.
   * Analizin başlangıcı/bitişi, ölçüm sonuçları gibi "hata değil ama system.log'da mutlaka
   * bulunmalı" diyebileceğimiz olaylar için. Sıradan info logları sunucuya taşınmaz.
   */
  audit: (scope: string, message: string, meta?: unknown) => write("info", scope, message, meta, true),
  /** Kritik bir noktada beklemeden göndermek için (ör. analiz bitişi). */
  flush,
};

/** Yakalanan bir hatayı log meta'sına uygun sade bir nesneye çevirir. */
export function clientErrorMeta(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { value: String(error) };
}
