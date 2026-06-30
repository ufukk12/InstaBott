import { NextRequest } from "next/server";
import {
  badRequest,
  checkRateLimit,
  generateVerificationToken,
  getClientIp,
  hashPassword,
  parseJsonBody,
  rateLimitResponse,
  registerSchema,
  serverError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSec!);

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Geçersiz istek gövdesi");
    const parsed = parseJsonBody(body, registerSchema);
    if (!parsed.success) return badRequest(parsed.error);

    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // E-posta enumeration saldırısını zorlaştır
      return NextResponse.json(
        {
          message:
            "Kayıt işlemi alındı. E-posta adresinize doğrulama bağlantısı gönderildi.",
        },
        { status: 201 }
      );
    }

    const passwordHash = await hashPassword(password);
    const { token, expiresAt } = generateVerificationToken();

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        isVerified: false,
        verificationToken: token,
        verificationExpires: expiresAt,
      },
    });

    try {
      await sendVerificationEmail(email, token);
    } catch (mailError) {
      console.error("Doğrulama e-postası gönderilemedi:", mailError);
      return serverError(
        "Hesap oluşturuldu ancak doğrulama e-postası gönderilemedi. Lütfen daha sonra tekrar deneyin."
      );
    }

    return NextResponse.json(
      {
        message:
          "Kayıt başarılı. Lütfen e-posta adresinize gönderilen doğrulama bağlantısına tıklayın.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register hatası:", error);
    return serverError();
  }
}
