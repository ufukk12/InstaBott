import { NextResponse } from "next/server";
import { searchFollowerByUsername, sanitizeSessionId } from "@/lib/instagramApi";
import { logger, errorMeta } from "@/lib/logger";

/**
 * Tek bir kullanıcının hedefin takipçisi olup olmadığını KESİN olarak doğrular.
 *
 * GT ("geri takip etmeyenler") listesindeki yalancı pozitifleri temizlemek için kullanılır:
 * takipçi listesi eksik çekildiğinde, aslında geri takip eden kişiler o listeye düşer.
 * Bu uç nokta, istatistiksel tahmin yerine kesin cevap verir.
 *
 * Yanıt:
 *   { isFollower: true }   → kişi kesinlikle takipçi, GT listesinden çıkarılmalı
 *   { isFollower: false }  → SONUÇSUZ; çağıran kişiyi listede BIRAKIR (fail-safe)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const username = String(body.username ?? "").trim();
    const expectedId = body.expectedId ? String(body.expectedId).trim() : undefined;
    const sessionId = sanitizeSessionId(body.sessionId ?? null);

    if (!userId || !/^\d+$/.test(userId) || !username || !sessionId) {
      return NextResponse.json({ error: "Geçersiz parametreler" }, { status: 400 });
    }

    const result = await searchFollowerByUsername(userId, sessionId, username, expectedId);

    if (!result.ok) {
      const status =
        result.reason === "RATE_LIMIT" ? 429 :
        result.reason === "INVALID_SESSION" ? 401 :
        result.reason === "NOT_FOUND" ? 404 :
        result.reason === "NETWORK" ? 503 : 502;
      return NextResponse.json({ error: result.reason, code: result.reason }, { status });
    }

    return NextResponse.json(
      { isFollower: result.isFollower, matched: result.matched },
      { status: 200 }
    );
  } catch (error) {
    logger.error("api:ig/verify-follower", "Sunucu hatası", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
