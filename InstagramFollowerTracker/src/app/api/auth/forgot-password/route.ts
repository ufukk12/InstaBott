import { NextRequest, NextResponse } from "next/server";
import {
  badRequest,
  checkRateLimit,
  forgotPasswordSchema,
  generateOtp,
  getClientIp,
  parseJsonBody,
  rateLimitResponse,
  serverError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPasswordResetOtp } from "@/lib/email";

const GENERIC_MESSAGE =
  "E-posta kayıtlıysa şifre sıfırlama kodu gönderildi.";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`forgot-password:${ip}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSec!);

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Geçersiz istek gövdesi");
    const parsed = parseJsonBody(body, forgotPasswordSchema);
    if (!parsed.success) return badRequest(parsed.error);

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    // Kullanıcı yoksa bile aynı mesaj — enumeration koruması
    if (!user) {
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

    const { otp, expiresAt } = generateOtp();

    // Eski kullanılmamış OTP'leri geçersiz kıl
    await prisma.passwordReset.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        otp,
        expiresAt,
      },
    });

    try {
      await sendPasswordResetOtp(email, otp);
    } catch (mailError) {
      console.error("OTP e-postası gönderilemedi:", mailError);
      return serverError("Kod gönderilemedi. Lütfen daha sonra tekrar deneyin.");
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Forgot password hatası:", error);
    return serverError();
  }
}
