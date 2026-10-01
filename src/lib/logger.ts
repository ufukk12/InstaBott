/**
 * Sunucu Tarafı Logger — logs/system.log
 *
 * Tasarım ilkeleri:
 *   1. LOGLAMA ASLA UYGULAMAYI ÇÖKERTMEZ. Her yazma hatası yutulur; dosya sistemi
 *      salt-okunursa (serverless/Vercel gibi) dosya yazımı kalıcı olarak kapatılır ve
 *      loglar yalnızca konsola düşer.
 *   2. Satır başına tek kayıt. Mesaj içindeki satır sonları temizlenir — kullanıcı
 *      verisinden gelebilecek log injection'ı engeller.
 *   3. Yazımlar sıraya alınır (writeQueue), böylece eşzamanlı istekler birbirinin
 *      satırının ortasına yazamaz.
 *   4. Konsol çıktısı yalnızca development'ta; production terminali temiz kalır.
 *
 * NOT: Bu modül SADECE sunucuda çalışır (fs kullanır). Tarayıcı tarafı için
 * clientLogger.ts kullanılmalıdır.
 */

import fs from "fs";
import path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase();
  if (fromEnv && fromEnv in LEVEL_ORDER) return fromEnv as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const MIN_LEVEL = resolveMinLevel();
const IS_DEV = process.env.NODE_ENV !== "production";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "system.log");

/** Dosya bu boyutu aşınca döndürülür (rotate). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Saklanacak eski dosya sayısı: system.log.1 … system.log.3 */
const MAX_ROTATED_FILES = 3;

/** Yazma kalıcı olarak başarısızsa (ör. salt-okunur FS) tekrar denemeyi bırak. */
let fileWritable = true;
/** Yazımları sıraya alır — satırların iç içe geçmesini önler. */
let writeQueue: Promise<void> = Promise.resolve();

/** Satır sonlarını temizler: bir kayıt = bir satır (log injection koruması). */
function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Meta veriyi güvenle serialize eder — döngüsel referans logu çökertmesin. */
function safeJson(meta: unknown): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(meta, (_key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val as object)) return "[Circular]";
        seen.add(val as object);
      }
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      return val;
    });
  } catch {
    return '"[serialize-edilemedi]"';
  }
}

function formatLine(level: LogLevel, scope: string, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${sanitize(scope)}] ${sanitize(message)}`;
  return meta === undefined ? line : `${line} ${sanitize(safeJson(meta))}`;
}

/** Dosya boyutu sınırı aşıldıysa system.log.N zincirini kaydırır. */
async function rotateIfNeeded(): Promise<void> {
  const stat = await fs.promises.stat(LOG_FILE).catch(() => null);
  if (!stat || stat.size < MAX_FILE_BYTES) return;

  // En eskiyi sil, kalanları bir kaydır: .2 → .3, .1 → .2, system.log → .1
  await fs.promises.rm(`${LOG_FILE}.${MAX_ROTATED_FILES}`, { force: true }).catch(() => {});
  for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
    await fs.promises.rename(`${LOG_FILE}.${i}`, `${LOG_FILE}.${i + 1}`).catch(() => {});
  }
  await fs.promises.rename(LOG_FILE, `${LOG_FILE}.1`).catch(() => {});
}

function appendToFile(line: string): void {
  if (!fileWritable) return;

  // Sıraya ekle. Zincirdeki hata bir sonraki yazımı engellemesin diye her adım kendi
  // catch'ine sahip.
  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.mkdir(LOG_DIR, { recursive: true });
      await rotateIfNeeded();
      await fs.promises.appendFile(LOG_FILE, line + "\n", "utf8");
    })
    .catch((err) => {
      // Salt-okunur dosya sistemi (serverless) veya izin hatası: bir daha deneme.
      fileWritable = false;
      if (IS_DEV) {
        console.warn(`[logger] Dosyaya yazılamıyor, dosya loglaması kapatıldı: ${String(err)}`);
      }
    });
}

function write(level: LogLevel, scope: string, message: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const line = formatLine(level, scope, message, meta);

  // Konsol: yalnızca development. Production terminali kirlenmesin.
  if (IS_DEV) {
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  appendToFile(line);
}

export const logger = {
  debug: (scope: string, message: string, meta?: unknown) => write("debug", scope, message, meta),
  info: (scope: string, message: string, meta?: unknown) => write("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => write("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => write("error", scope, message, meta),
};

/** Yakalanan bir hatayı log meta'sına uygun sade bir nesneye çevirir. */
export function errorMeta(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}

/** Testler / kapatma sırasında bekleyen yazımların bitmesini bekler. */
export function flushLogs(): Promise<void> {
  return writeQueue.catch(() => {});
}
