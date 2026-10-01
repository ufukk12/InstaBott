import { NextResponse } from "next/server";
import { fetchMediaLikersPage, sanitizeSessionId } from "@/lib/instagramApi";
import { logger, errorMeta } from "@/lib/logger";

/**
 * Belirtilen postun beğenenlerinin TEK sayfasını çeker.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mediaId = String(body.mediaId ?? "").trim();
    const sessionId = sanitizeSessionId(body.sessionId ?? null);
    const maxId = body.maxId ? String(body.maxId).trim() : null;

    if (!mediaId || !sessionId) {
      return NextResponse.json({ error: "Geçersiz mediaId veya sessionId" }, { status: 400 });
    }

    const result = await fetchMediaLikersPage(mediaId, sessionId, maxId);

    if (!result.ok) {
      const status =
        result.reason === "RATE_LIMIT" ? 429 :
        result.reason === "INVALID_SESSION" ? 401 :
        result.reason === "NOT_FOUND" ? 404 :
        result.reason === "NETWORK" ? 503 : 502;
      return NextResponse.json({ error: result.reason, code: result.reason }, { status });
    }

    return NextResponse.json(
      { users: result.users, nextMaxId: result.nextMaxId },
      { status: 200 }
    );
  } catch (error) {
    logger.error("api:ig/likers", "Hata", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
