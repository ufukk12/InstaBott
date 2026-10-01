import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, unauthorized, serverError } from "@/lib/auth";
import { checkQuota } from "@/lib/tokenManager";
import { logger, errorMeta } from "@/lib/logger";

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const type = body.type === 'ghost' ? 'ghost' : 'normal';

    const quotaResult = await checkQuota(decoded.userId, type);
    
    if (!quotaResult.allowed) {
      return NextResponse.json(quotaResult, { status: 403 });
    }

    return NextResponse.json(quotaResult);
  } catch (error) {
    logger.error("api:tokens/check", "Token check hatası", errorMeta(error));
    return serverError("Kota kontrolü sırasında bir hata oluştu");
  }
}
