import {
  badRequest,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  verifyEmailSchema,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { logger, errorMeta } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`verify-email:${ip}`, 10, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSec!);

  const token = request.nextUrl.searchParams.get("token");
  const parsed = verifyEmailSchema.safeParse({ token: token ?? "" });
  if (!parsed.success) return badRequest("Geçersiz doğrulama bağlantısı");

  try {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: parsed.data.token,
        verificationExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return badRequest("Doğrulama bağlantısı geçersiz veya süresi dolmuş");
    }

    if (user.isVerified) {
      return NextResponse.json({ message: "E-posta zaten doğrulanmış" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    });

    return NextResponse.json({
      message: "E-posta başarıyla doğrulandı. Artık giriş yapabilirsiniz.",
    });
  } catch (error) {
    logger.error("api:auth/verify-email", "Verify email hatası", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST ile de token gönderilebilir (API testleri için)
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`verify-email:${ip}`, 10, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSec!);

  try {
    const body = await request.json();
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) return badRequest("Geçersiz doğrulama token'ı");

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: parsed.data.token,
        verificationExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return badRequest("Doğrulama bağlantısı geçersiz veya süresi dolmuş");
    }

    if (user.isVerified) {
      return NextResponse.json({ message: "E-posta zaten doğrulanmış" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    });

    return NextResponse.json({
      message: "E-posta başarıyla doğrulandı. Artık giriş yapabilirsiniz.",
    });
  } catch (error) {
    logger.error("api:auth/verify-email", "Verify email hatası", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
