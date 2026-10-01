import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN = "7d";
const VERIFICATION_TOKEN_BYTES = 32;
const OTP_LENGTH = 4;
const OTP_EXPIRY_MINUTES = 10;

// --- Basit bellek içi rate limit (prod'da Redis tercih edilir) ---
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true };
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}

// --- Girdi doğrulama şemaları ---
export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Geçerli bir e-posta adresi girin")
    .max(255),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter olmalı")
    .max(128, "Şifre en fazla 128 karakter olabilir"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "OTP 4 haneli olmalı"),
});

// resetPasswordSchema: reset-password/route.ts içine taşındı.
// Artık resetToken bazlı akış kullanılıyor (OTP değil).

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1).max(128),
});

// --- Şifre & token yardımcıları ---
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateVerificationToken(): {
  token: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 saat
  return { token, expiresAt };
}

export function generateOtp(): { otp: string; expiresAt: Date } {
  // Kriptografik olarak güvenli 4 haneli OTP (0000-9999)
  const num = crypto.randomInt(0, 10000);
  const otp = String(num).padStart(OTP_LENGTH, "0");
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  return { otp, expiresAt };
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET tanımlı değil veya çok kısa (min 32 karakter)");
  }
  return secret;
}

export function signAuthToken(userId: string, email: string, displayId: string): string {
  return jwt.sign({ sub: userId, email, displayId }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyAuthToken(token: string): { userId: string; email: string; displayId: string } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (!payload.sub || typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      displayId: typeof payload.displayId === "string" ? payload.displayId : "",
    };
  } catch {
    return null;
  }
}

export function authSuccessResponse(token: string, user: { id: string; email: string; displayId: string }) {
  return NextResponse.json({
    message: "Giriş başarılı",
    token,
    user: { id: user.id, email: user.email, displayId: user.displayId },
  });
}

export function parseJsonBody<T>(
  body: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  // body null ise JSON parse hatası gelmiş demek
  if (body === null || body === undefined) {
    return { success: false, error: "Geçersiz istek gövdesi" };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.errors[0]?.message ?? "Geçersiz istek";
    return { success: false, error: firstError };
  }
  return { success: true, data: result.data };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized(message = "Yetkisiz erişim") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function serverError(message = "Sunucu hatası") {
  return NextResponse.json({ error: message }, { status: 500 });
}
