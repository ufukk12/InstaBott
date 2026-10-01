import { NextResponse } from "next/server";
import { fetchUserInfo, sanitizeSessionId } from "@/lib/instagramApi";
import { logger, errorMeta } from "@/lib/logger";

/**
 * Hedef profil ID çıkarımı — Python'daki get_user_id fonksiyonunun karşılığı.
 *
 * Python:
 *   def get_user_id(username, headers):
 *       url = f"{BASE_URL}/users/{username}/usernameinfo/"
 *       return response.json()["user"]["pk"]
 *
 * GET ve POST desteklenir. Frontend GET kullanır (onboarding), client POST kullanır (analiz).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");
  const rawSessionId = searchParams.get("sessionId");
  const sessionId = sanitizeSessionId(rawSessionId);

  if (!username || !sessionId) {
    return NextResponse.json({ error: "Eksik parametreler" }, { status: 400 });
  }

  return handleProfileRequest(username, sessionId);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username ?? "").trim();
    const sessionId = sanitizeSessionId(body.sessionId ?? null);

    if (!username || !sessionId) {
      return NextResponse.json({ error: "Eksik parametreler" }, { status: 400 });
    }

    return handleProfileRequest(username, sessionId);
  } catch (error) {
    logger.error("api:ig/get-profile", "Hata", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

async function handleProfileRequest(username: string, sessionId: string) {
  const result = await fetchUserInfo(username, sessionId);

  if (!result.ok) {
    const status =
      result.reason === "RATE_LIMIT" ? 429 :
      result.reason === "INVALID_SESSION" ? 401 :
      result.reason === "NOT_FOUND" ? 404 :
      result.reason === "NETWORK" ? 503 : 502;
    return NextResponse.json({ error: result.reason, code: result.reason }, { status });
  }

  return NextResponse.json({
    targetId: result.userId,
    username: result.username,
    fullName: result.fullName,
    followersCount: result.followersCount,
    followingCount: result.followingCount,
    profilePicUrl: result.profilePicUrl,
  }, { status: 200 });
}
