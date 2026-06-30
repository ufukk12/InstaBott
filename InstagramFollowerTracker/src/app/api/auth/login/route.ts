import { NextRequest } from "next/server";
import {
  authSuccessResponse,
  badRequest,
  checkRateLimit,
  getClientIp,
  loginSchema,
  parseJsonBody,
  rateLimitResponse,
  serverError,
  signAuthToken,
  unauthorized,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSec!);

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Geçersiz istek gövdesi");
    const parsed = parseJsonBody(body, loginSchema);
    if (!parsed.success) return badRequest(parsed.error);

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return unauthorized("E-posta veya şifre hatalı");
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return unauthorized("E-posta veya şifre hatalı");
    }

    // Doğrulanmamış hesapla giriş engellenir
    if (!user.isVerified) {
      return unauthorized(
        "E-posta adresiniz henüz doğrulanmamış. Lütfen gelen kutunuzu kontrol edin."
      );
    }

    const token = signAuthToken(user.id, user.email);
    return authSuccessResponse(token, { id: user.id, email: user.email });
  } catch (error) {
    console.error("Login hatası:", error);
    return serverError();
  }
}
