import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, unauthorized, serverError } from "@/lib/auth";
import { consumeAnalysisCredit, InsufficientBalanceError } from "@/lib/tokenManager";
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
    // 'analysis' eski istemcilerden gelebilen alias — 'normal'a indirgenir
    const type = body.type === 'ghost' ? 'ghost' : 'normal';

    // Karar + kesinti + log tek atomik işlemde (bkz. tokenManager.consumeAnalysisCredit)
    const result = await consumeAnalysisCredit(decoded.userId, type);

    return NextResponse.json({
      success: true,
      consumedToken: result.consumedToken,
      tokensRemaining: result.tokensRemaining,
      usageLogId: result.usageLogId,
      message: result.consumedToken
        ? "1 FollowerToken kullanıldı"
        : "Ücretsiz analiz hakkı kullanıldı",
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return NextResponse.json(
        { error: "Yetersiz bakiye", code: "INSUFFICIENT_BALANCE" },
        { status: 402 }
      );
    }
    logger.error("api:tokens/deduct", "Token deduct hatası", errorMeta(error));
    return serverError("Kullanım işlenirken bir hata oluştu");
  }
}
