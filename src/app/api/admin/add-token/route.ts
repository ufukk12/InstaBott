import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAuthToken, getClientIp, checkRateLimit, rateLimitResponse } from "@/lib/auth";
import { logger, errorMeta } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`admin-token:${ip}`, 10, 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSec!);

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    const payload = verifyAuthToken(token);
    
    if (!payload || !payload.email) {
      return NextResponse.json({ error: "Geçersiz oturum" }, { status: 401 });
    }

    // Admin kontrolü: E-posta üzerinden kesin yetki
    if (payload.email !== "kadri3749@gmail.com" && payload.email !== "ufku795@gmail.com") {
      return NextResponse.json({ error: "Erişim reddedildi. Yönetici yetkisi gerekiyor." }, { status: 403 });
    }

    const body = await request.json();
    const { targetId, amount } = body;

    if (!targetId || typeof targetId !== "string" || targetId.length !== 7) {
      return NextResponse.json({ error: "Geçersiz hedef Kullanıcı ID (7 haneli olmalı)" }, { status: 400 });
    }

    const tokenAmount = parseInt(amount, 10);
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
      return NextResponse.json({ error: "Geçerli bir bilet miktarı girin" }, { status: 400 });
    }

    // Hedef kullanıcıyı bul
    const targetUser = await prisma.user.findUnique({
      where: { displayId: targetId }
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    // İşlem: Bakiyeyi güncelle ve geçmişe (Purchase tablosuna) yaz
    await prisma.$transaction([
      prisma.user.update({
        where: { id: targetUser.id },
        data: { followerTokens: { increment: tokenAmount } }
      }),
      prisma.purchase.create({
        data: {
          userId: targetUser.id,
          amount: tokenAmount
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: `${targetId} kimlikli kullanıcıya ${tokenAmount} adet bilet başarıyla yüklendi.`
    });
  } catch (error) {
    logger.error("api:admin/add-token", "Admin add-token hatası", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
