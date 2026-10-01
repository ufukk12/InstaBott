import { NextResponse } from "next/server";
import { fetchFriendshipPage, sanitizeSessionId } from "@/lib/instagramApi";
import { logger, errorMeta } from "@/lib/logger";

/**
 * Takip edilen listesinin TEK sayfasını çeker.
 * Python'daki _fetch_paginated_list("following") fonksiyonunun
 * sunucu tarafı proxy karşılığı. Sayfalama client tarafında yönetilir.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const sessionId = sanitizeSessionId(body.sessionId ?? null);
    const maxId = body.maxId ? String(body.maxId).trim() : null;

    if (!userId || !sessionId || !/^\d+$/.test(userId)) {
      return NextResponse.json({ error: "Geçersiz userId veya sessionId" }, { status: 400 });
    }

    const result = await fetchFriendshipPage(userId, sessionId, "following", maxId);

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
    logger.error("api:ig/following", "Hata", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
