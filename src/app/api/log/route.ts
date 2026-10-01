import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, getClientIp, checkRateLimit } from "@/lib/auth";
import { logger, type LogLevel } from "@/lib/logger";

/**
 * Tarayıcı Log Alım Noktası
 *
 * Analiz döngüsü tarayıcıda çalıştığı için en kritik loglar (rate limit, oturum ölümü,
 * sayfalama hataları) sunucuya ancak buradan ulaşabilir. clientLogger bu endpoint'e
 * toplu (batch) gönderim yapar.
 *
 * GÜVENLİK: Bu endpoint dışarıdan gelen metni log dosyasına yazdığı için sıkı sınırlar var:
 *   • JWT zorunlu — anonim istekler diski dolduramaz
 *   • IP başına hız sınırı
 *   • Kayıt sayısı ve metin uzunluğu kırpılır
 *   • Satır sonları logger.sanitize içinde temizlenir (log injection koruması)
 *
 * Loglama hiçbir zaman istemciyi engellememeli: hata durumunda bile 204 döner.
 */

const MAX_ENTRIES_PER_REQUEST = 50;
const MAX_MESSAGE_LENGTH = 1_000;
const MAX_SCOPE_LENGTH = 64;
const MAX_META_LENGTH = 2_000;

const VALID_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error"]);

type IncomingEntry = {
  level?: unknown;
  scope?: unknown;
  message?: unknown;
  meta?: unknown;
  at?: unknown;
};

function clampString(value: unknown, maxLength: number, fallback: string): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  return value.slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  // Log alımı asla istemciye hata döndürmez — 204 ile sessizce biter.
  const noContent = new NextResponse(null, { status: 204 });

  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`client-log:${ip}`, 30, 60 * 1000);
    if (!rate.allowed) return noContent;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return noContent;

    const payload = verifyAuthToken(authHeader.split(" ")[1]);
    if (!payload?.userId) return noContent;

    const body = await request.json().catch(() => null);
    const entries: unknown = (body as { entries?: unknown })?.entries;
    if (!Array.isArray(entries)) return noContent;

    for (const raw of entries.slice(0, MAX_ENTRIES_PER_REQUEST)) {
      const entry = raw as IncomingEntry;

      const level = (
        typeof entry.level === "string" && VALID_LEVELS.has(entry.level) ? entry.level : "info"
      ) as LogLevel;

      const scope = clampString(entry.scope, MAX_SCOPE_LENGTH, "client");
      const message = clampString(entry.message, MAX_MESSAGE_LENGTH, "(boş mesaj)");

      // Kaynağı ayırt edilebilir tut: bu satırlar tarayıcıdan geldi, sunucudan değil.
      const meta: Record<string, unknown> = {
        userId: payload.userId,
        clientAt: clampString(entry.at, 40, ""),
      };

      if (entry.meta !== undefined) {
        meta.detail = clampString(JSON.stringify(entry.meta), MAX_META_LENGTH, "");
      }

      logger[level](`client:${scope}`, message, meta);
    }

    return noContent;
  } catch {
    return noContent;
  }
}
