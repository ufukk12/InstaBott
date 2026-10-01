import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, unauthorized, serverError } from "@/lib/auth";
import { getUserCredits } from "@/lib/tokenManager";
import { logger, errorMeta } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return unauthorized("Geçersiz veya eksik token");
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAuthToken(token);
    
    if (!decoded) {
      return unauthorized("Geçersiz veya süresi dolmuş token");
    }

    const credits = await getUserCredits(decoded.userId);
    return NextResponse.json(credits);
  } catch (error) {
    logger.error("api:auth/me", "Auth /me hatası", errorMeta(error));
    return serverError("Kullanıcı bilgileri alınırken bir hata oluştu");
  }
}
