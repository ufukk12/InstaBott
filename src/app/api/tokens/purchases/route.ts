import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAuthToken, getClientIp, checkRateLimit, rateLimitResponse } from "@/lib/auth";
import { logger, errorMeta } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`purchases:${ip}`, 30, 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSec!);

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    const payload = verifyAuthToken(token);
    
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Geçersiz oturum" }, { status: 401 });
    }

    const purchases = await prisma.purchase.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ purchases });
  } catch (error) {
    logger.error("api:tokens/purchases", "Purchases fetch hatası", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
