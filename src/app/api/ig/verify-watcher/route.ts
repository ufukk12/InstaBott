import { NextResponse } from "next/server";
import { buildInstagramHeaders, IG_BASE, sanitizeSessionId } from "@/lib/instagramApi";
import { prisma as db } from "@/lib/db";
import { verifyAuthToken } from "@/lib/auth";
import { logger, errorMeta } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyAuthToken(token);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Geçersiz token" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawSessionId = body.sessionId;
    const sessionId = sanitizeSessionId(rawSessionId);

    if (!sessionId) {
      return NextResponse.json({ error: "SessionID gerekli" }, { status: 400 });
    }

    // 1. Fetch current user from IG
    const targetUrl = `${IG_BASE}/accounts/current_user/?edit=true`;

    const res = await fetch(targetUrl, {
      method: "GET",
      headers: buildInstagramHeaders(sessionId),
      cache: "no-store",
    });

    if (res.status === 429) {
      return NextResponse.json({ error: "Instagram Rate Limit, lütfen bekleyin" }, { status: 429 });
    }
    
    if (res.status === 401 || res.status === 403 || res.status === 400) {
      return NextResponse.json({ error: "Geçersiz SessionID (Giriş başarısız)" }, { status: 401 });
    }

    const data = await res.json().catch(() => ({}));
    const username = data.user?.username;

    if (!res.ok || !username) {
      return NextResponse.json({ error: "Kullanıcı bilgisi alınamadı, SessionID geçersiz olabilir" }, { status: 401 });
    }

    // 2. Check WatcherAccount Cooldown
    const watcher = await db.watcherAccount.findUnique({
      where: { username },
    });

    if (watcher && watcher.cooldownUntil > new Date()) {
      const diffMs = watcher.cooldownUntil.getTime() - Date.now();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      return NextResponse.json({ 
        error: `Bu gözcü hesap yakın zamanda kullanıldı, güvenlik için ${hours} saat ${minutes} dakika sonra tekrar kullanılabilir.`,
        cooldownUntil: watcher.cooldownUntil
      }, { status: 403 }); 
    }

    // 3. Return success + username
    return NextResponse.json({ success: true, username }, { status: 200 });

  } catch (error) {
    logger.error("api:ig/verify-watcher", "IG Verify Watcher Error", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
