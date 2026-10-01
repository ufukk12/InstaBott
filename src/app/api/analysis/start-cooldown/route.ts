import { NextResponse } from "next/server";
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
    const { username } = body;

    if (!username) {
      return NextResponse.json({ error: "Gözcü username gerekli" }, { status: 400 });
    }

    // NOT: Bu route ARTIK token kesmiyor. Kesinti tek noktada — /api/tokens/deduct —
    // atomik olarak yapılıyor. Buradaki ikinci deductCredit çağrısı, tek bir analizde
    // kullanıcıdan iki kez token düşmesine yol açıyordu.

    const cooldownUntil = new Date(Date.now() + 3 * 60 * 60 * 1000);

    // İki yazım tek transaction'da — biri yazılıp diğeri başarısız olamaz
    await db.$transaction([
      db.user.update({
        where: { id: payload.userId },
        data: { hasUsedFreeAnalysis: true }
      }),
      db.watcherAccount.upsert({
        where: { username },
        update: { cooldownUntil },
        create: { username, cooldownUntil }
      })
    ]);

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    logger.error("api:analysis/start-cooldown", "Start Cooldown Hatası", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
