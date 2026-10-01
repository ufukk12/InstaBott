import { NextResponse } from "next/server";
import { fetchLatestMedia, sanitizeSessionId } from "@/lib/instagramApi";
import { logger, errorMeta } from "@/lib/logger";

/**
 * Hedef hesabın son postunun media_id bilgisini döndürür.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const sessionId = sanitizeSessionId(body.sessionId ?? null);

    if (!userId || !sessionId || !/^\d+$/.test(userId)) {
      return NextResponse.json({ error: "Geçersiz userId veya sessionId" }, { status: 400 });
    }

    const result = await fetchLatestMedia(userId, sessionId);

    if (!result.ok) {
      const status =
        result.reason === "RATE_LIMIT" ? 429 :
        result.reason === "INVALID_SESSION" ? 401 :
        result.reason === "NO_POSTS" ? 404 : 502;
      return NextResponse.json({ error: result.reason, code: result.reason }, { status });
    }

    return NextResponse.json(
      { mediaId: result.mediaId, mediaCount: result.mediaCount },
      { status: 200 }
    );
  } catch (error) {
    logger.error("api:ig/latest-media", "Hata", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
