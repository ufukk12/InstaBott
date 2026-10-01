import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/db";
import { verifyAuthToken } from "@/lib/auth";
import { buildInstagramHeaders, IG_BASE, sanitizeSessionId, isLoginRequired } from "@/lib/instagramApi";
import { logger, errorMeta } from "@/lib/logger";

// Analiz başlamadan önceki ön kontrol — kullanıcı ekranda beklediği için kısa tutuldu.
// igRequest'in 18s + 2 retry bütçesi burada kasten kullanılmıyor.
const PRECHECK_TIMEOUT_MS = 10_000;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyAuthToken(token);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Gecersiz token" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawSessionId = body.sessionId;
    const sessionId = sanitizeSessionId(rawSessionId);

    if (!sessionId) {
      return NextResponse.json({ error: "SessionID gerekli" }, { status: 400 });
    }

    // 1. Fetch current user from IG to get username
    //
    // ÖLÜ SESSION ERKEN UYARI: Bu istek zaten gözcü hesabın kullanıcı adını almak için
    // atılıyor. Aynı yanıttan session'ın canlı olup olmadığını da okuyoruz — böylece
    // token kesilmeden önce ayrı bir "ping" isteği atmaya gerek kalmıyor (EK IG YÜKÜ YOK).
    //
    // Karar politikası: sadece KESİN sinyallerde "ölü" denir. Timeout, ağ hatası veya
    // bozuk JSON gibi belirsiz durumlarda fail-open davranılır (sessionValid: true) —
    // geçerli session'lı bir kullanıcıyı geçici bir ağ sorunu yüzünden durdurmak,
    // token kaybından daha kötü bir deneyimdir.
    const targetUrl = `${IG_BASE}/accounts/current_user/?edit=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PRECHECK_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: "GET",
        headers: buildInstagramHeaders(sessionId),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      // Timeout / ağ hatası → BELİRSİZ, analizi engelleme
      return NextResponse.json({ cooldownActive: false, sessionValid: true, indeterminate: true });
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status === 429) {
      return NextResponse.json({ error: "Instagram Rate Limit, lutfen bekleyin" }, { status: 429 });
    }

    // KESİN geçersiz oturum
    if (
      res.status === 401 ||
      res.status === 403 ||
      res.status === 400 ||
      (res.status >= 300 && res.status < 400)
    ) {
      return NextResponse.json({ cooldownActive: false, sessionValid: false, code: "INVALID_SESSION" });
    }

    const data = (await res
      .json()
      .catch(() => null)) as { user?: { username?: string } } | null;

    if (data === null) {
      // JSON parse edilemedi → BELİRSİZ, fail-open
      return NextResponse.json({ cooldownActive: false, sessionValid: true, indeterminate: true });
    }

    // Gövdede login_required / checkpoint sinyali → KESİN geçersiz
    if (!res.ok || isLoginRequired(data)) {
      return NextResponse.json({ cooldownActive: false, sessionValid: false, code: "INVALID_SESSION" });
    }

    const username = data.user?.username;

    // 200 döndü ama kimlik yok → oturum authenticate değil, KESİN geçersiz
    if (!username) {
      return NextResponse.json({ cooldownActive: false, sessionValid: false, code: "INVALID_SESSION" });
    }

    // 2. Check WatcherAccount Cooldown
    const watcher = await db.watcherAccount.findUnique({
      where: { username }
    });

    if (!watcher) {
      return NextResponse.json({ cooldownActive: false, sessionValid: true, username });
    }

    const now = new Date();
    const cooldownUntil = new Date(watcher.cooldownUntil);
    const remainingMs = cooldownUntil.getTime() - now.getTime();

    if (remainingMs > 0) {
      return NextResponse.json({
        cooldownActive: true,
        sessionValid: true,
        remainingMs,
        cooldownUntil: watcher.cooldownUntil,
        username
      });
    }

    return NextResponse.json({ cooldownActive: false, sessionValid: true, username });

  } catch (error) {
    logger.error("api:analysis/check-watcher", "Check Watcher Hatasi", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatasi" }, { status: 500 });
  }
}
