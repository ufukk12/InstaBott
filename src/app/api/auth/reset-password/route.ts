import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  checkRateLimit,
  getClientIp,
  hashPassword,
  parseJsonBody,
  rateLimitResponse,
  serverError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger, errorMeta } from "@/lib/logger";

// verify-otp'nin döndürdüğü resetToken + yeni şifre bekleniyor
const resetPasswordSchema = z.object({
  resetToken: z.string().trim().min(64).max(64), // 32 byte hex = 64 karakter
  newPassword: z.string().min(8, "Şifre en az 8 karakter olmalı").max(128),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limit: 5 deneme / 15 dakika
  const rate = checkRateLimit(`reset-password:${ip}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSec!);

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Geçersiz istek gövdesi");

    const parsed = parseJsonBody(body, resetPasswordSchema);
    if (!parsed.success) return badRequest(parsed.error);

    const { resetToken, newPassword } = parsed.data;

    // verify-otp'nin oluşturduğu geçici token'ı DB'de ara
    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        resetToken,
        resetTokenUsed: false,
        resetTokenExpires: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    // Kritik: Geçersiz ya da süresi dolmuş token'a enumeration-safe hata ver
    if (!resetRecord) {
      return badRequest("Geçersiz veya süresi dolmuş şifre sıfırlama oturumu. Lütfen tekrar başlayın.");
    }

    const passwordHash = await hashPassword(newPassword);

    // Atomic işlem: şifreyi güncelle + resetToken'ı kullanılmış işaretle
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { resetTokenUsed: true },
      }),
      // Aynı kullanıcının varsa diğer aktif reset kayıtlarını da temizle
      prisma.passwordReset.updateMany({
        where: {
          userId: resetRecord.userId,
          id: { not: resetRecord.id },
          resetTokenUsed: false,
        },
        data: { resetTokenUsed: true, used: true },
      }),
    ]);

    return NextResponse.json({
      message: "Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz.",
    });
  } catch (error) {
    logger.error("api:auth/reset-password", "Reset password hatası", errorMeta(error));
    return serverError();
  }
}
