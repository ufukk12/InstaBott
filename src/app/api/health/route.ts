import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Sağlık kontrolü: API ve DB bağlantısı durumunu döner
export async function GET() {
  let dbStatus: "ok" | "error" = "ok";
  let dbError: string | undefined;

  try {
    // DB'ye basit bir sorgu at — bağlantı sağlıklı mı kontrol et
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbStatus = "error";
    // Production'da detaylı hata mesajını dışarıya sızdırma
    dbError =
      process.env.NODE_ENV === "development"
        ? String(err)
        : "Veritabanı bağlantısı kurulamadı";
  }

  const allOk = dbStatus === "ok";

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      service: "instagram-follower-tracker-api",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        ...(dbError ? { databaseError: dbError } : {}),
      },
    },
    { status: allOk ? 200 : 503 }
  );
}
