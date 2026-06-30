import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  badRequest,
  checkRateLimit,
  getClientIp,
  parseJsonBody,
  rateLimitResponse,
  serverError,
  verifyOtpSchema,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // IP bazlı rate limit: 10 deneme / 15 dakika
  const ipRate = checkRateLimit(`verify-otp:ip:${ip}`, 10, 15 * 60 * 1000);
  if (!ipRate.allowed) return rateLimitResponse(ipRate.retryAfterSec!);

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Geçersiz istek gövdesi");

    const parsed = parseJsonBody(body, verifyOtpSchema);
    if (!parsed.success) return badRequest(parsed.error);

    const { email, otp } = parsed.data;

    // Email bazlı ek rate limit: brute force'u engelle (5 deneme / 15 dk)
    const emailRate = checkRateLimit(`verify-otp:email:${email}`, 5, 15 * 60 * 1000);
    if (!emailRate.allowed) return rateLimitResponse(emailRate.retryAfterSec!);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Kullanıcı bulunamasa da aynı hata mesajını ver — enumeration koruması
      return badRequest("Geçersiz veya süresi dolmuş kod");
    }

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        userId: user.id,
        otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!resetRecord) {
      return badRequest("Geçersiz veya süresi dolmuş kod");
    }

    // Kritik: OTP doğrulandı → geçici bir resetToken üret ve kaydet.
    // Bu sayede reset-password endpoint'i artık OTP'yi kabul etmez,
    // sadece bu kısa ömürlü token'ı kabul eder.
    // Böylece OTP brute-force saldırıları sonraki adımda işe yaramaz.
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 dk

    await prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: {
        used: true,            // OTP artık kullanılamaz
        resetToken,            // Güvenli geçici token
        resetTokenExpires,
      },
    });

    return NextResponse.json({
      message: "Kod doğrulandı. Yeni şifrenizi belirleyebilirsiniz.",
      valid: true,
      resetToken, // Frontend bu token'ı reset-password isteğinde gönderecek
    });
  } catch (error) {
    console.error("Verify OTP hatası:", error);
    return serverError();
  }
}
