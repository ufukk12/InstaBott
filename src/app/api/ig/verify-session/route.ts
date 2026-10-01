import { NextResponse } from "next/server";
import { buildInstagramHeaders, IG_BASE } from "@/lib/instagramApi";
import { sanitizeSessionId } from "@/lib/instagramApi";
import { logger, errorMeta } from "@/lib/logger";

const VERIFY_TIMEOUT_MS = 10_000;

/**
 * Session doğrulama — Mobil API (i.instagram.com) üzerinden
 * Python'daki build_headers ile aynı header seti kullanılır.
 * "instagram" resmi hesabına usernameinfo isteği atarak session'ın canlı olup
 * olmadığını test eder.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawSessionId = body.sessionId;
    const sessionId = sanitizeSessionId(rawSessionId);

    if (!sessionId) {
      return NextResponse.json({ error: "Eksik parametre (sessionId)" }, { status: 400 });
    }

    // Zararsız endpoint: "instagram" resmi hesabının bilgisi
    const targetUrl = `${IG_BASE}/users/instagram/usernameinfo/`;

    // Timeout koruması: bu endpoint analiz öncesi "ping" olarak da kullanılıyor.
    // Timeout olmadan asılı kalan bir istek, kullanıcıyı ekranda süresiz bekletirdi.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: "GET",
        headers: buildInstagramHeaders(sessionId),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      // Timeout / ağ hatası → session hakkında hüküm VERİLEMEZ.
      // 503 döndürülür; çağıranlar bunu "belirsiz" olarak yorumlar, "geçersiz" olarak değil.
      return NextResponse.json({ error: "Bağlantı zaman aşımı", code: "NETWORK" }, { status: 503 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status === 429) {
      return NextResponse.json({ error: "Rate limit", code: "RATE_LIMIT" }, { status: 429 });
    }

    if (
      res.status === 401 ||
      res.status === 403 ||
      (res.status >= 300 && res.status < 400)
    ) {
      return NextResponse.json({ error: "Unauthorized", code: "INVALID_SESSION" }, { status: 401 });
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return NextResponse.json({ error: "Unauthorized", code: "INVALID_SESSION" }, { status: 401 });
    }

    if (!res.ok) {
      // JSON gövdesindeki "login_required" vb. kontrol
      const bodyData = data as Record<string, unknown>;
      if (bodyData.status === "fail" || bodyData.require_login === true) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Bilinmeyen Hata", status: res.status }, { status: res.status });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("api:ig/verify-session", "IG Verify Session API Hatası", errorMeta(error));
    return NextResponse.json({ error: "Sunucu bağlantı hatası" }, { status: 500 });
  }
}
