import { NextResponse } from "next/server";
import { fetchFriendshipPage, sanitizeSessionId } from "@/lib/instagramApi";
import { logger, errorMeta } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const sessionId = sanitizeSessionId(body.sessionId ?? null);

    if (!userId || !sessionId || !/^\d+$/.test(userId)) {
      return NextResponse.json({ error: "Geçersiz userId veya sessionId" }, { status: 400 });
    }

    const startTime = Date.now();
    
    // 1. İstek: İlk 25 veriyi çekiyoruz
    const result1 = await fetchFriendshipPage(userId, sessionId, "followers", null, 25);
    
    let result = result1;
    let fetchedCount = result1.ok ? result1.users.length : 0;
    
    // Eğer ilk istek başarılıysa ve daha fazla veri varsa, 2. sayfayı test ediyoruz
    if (result1.ok && result1.nextMaxId) {
      // 2. İstek: Sonraki 25 veri
      const result2 = await fetchFriendshipPage(userId, sessionId, "followers", result1.nextMaxId, 25);
      
      if (!result2.ok) {
        // İkinci istek hata verdiyse (Rate Limit vb.), hata durumunu ana sonuca yansıtıyoruz
        result = result2; 
      } else {
        fetchedCount += result2.users.length;
        result = { 
          ...result2, 
          users: [...result1.users, ...result2.users] // Toplam kullanıcıları birleştir
        };
      }
    }
    
    const latency = Date.now() - startTime;

    let score = 100;
    let status = "GREEN_FLAG";
    let message = "Hesap son derece sağlıklı ve analize hazır görünüyor.";
    const recoveryTips: string[] = [];

    if (!result.ok) {
      score = 0;
      status = "RED_FLAG";
      if (result.reason === "RATE_LIMIT") {
        message = "Hesap kısıtlanmış (Rate Limit - Çok Fazla İstek).";
        recoveryTips.push("Eğer arka arkaya çok fazla analiz yaptıysanız, bu hesabınızı 24 saat dinlendirin.");
      } else if (result.reason === "INVALID_SESSION") {
        message = "Oturum geçersiz veya sona ermiş (Invalid Session).";
        recoveryTips.push("⚠️ Kritik: Gözcü hesabınızın telefondaki veya başka cihazlardaki açık oturumlarından tamamen çıkış yapın. Oturum sadece bu tarayıcıda açık kalmalıdır. Eşzamanlı oturumlar verimliliği düşürür.");
      } else {
        message = `Erişim engellendi (${result.reason}). Hesap mimlenmiş olabilir.`;
        recoveryTips.push("Hesabınız ciddi kısıtlamaya maruz kalmış. Tamamen yeni bir gözcü hesap açarak sıfırdan ve çok daha hızlı bir analiz yapabilirsiniz.");
      }
    } else {
      const successfulResult = result as Extract<typeof result, { ok: true }>;
      const fetchedCount = successfulResult.users.length;
      
      // Pagination Consistency Check:
      // Eğer 2 istek attıysak beklenen toplam sayı 50'dir. 
      // Eğer dönen veri sayısı 50'den (veya tek istek atıldıysa 25'ten) azsa ve hala devamı var gibi (nextMaxId) dönüyorsa hesap kısıtlıdır.
      const expectedCount = (result1.ok && result1.nextMaxId) ? 50 : 25;
      
      if (fetchedCount < expectedCount && successfulResult.nextMaxId != null) {
        score -= 40;
        status = "GRAY_FLAG";
        message = "Hesap kısmen kısıtlanmış. API isteklerine eksik veri veya boş sayfa dönüyor.";
        recoveryTips.push("Hesabınıza bir profil fotoğrafı eklemek ve biyografiyi doldurmak, Instagram algoritmalarında 'gerçek insan' güveni verir.");
        recoveryTips.push("Eğer arka arkaya çok fazla analiz yaptıysanız, bu hesabınızı 24 saat dinlendirin.");
      }
      
      // Latency (Gecikme) Kontrolü
      // 2 istek atıldığı için eşik süreyi 3000ms'den 5000ms'ye çıkarıyoruz
      if (latency > 5000) {
        score -= 20;
        if (status === "GREEN_FLAG") {
          status = "GRAY_FLAG";
          message = "Hesabın API yanıt süresi çok yüksek (Ağır çalışıyor).";
        }
        recoveryTips.push("API gecikmesi tespit edildi. Analizler normalden daha uzun sürebilir veya kesintiye uğrayabilir.");
      }
    }

    if (score < 0) score = 0;

    return NextResponse.json(
      { score, status, message, recoveryTips, latency },
      { status: 200 }
    );
  } catch (error) {
    logger.error("api:ig/health", "Hata", errorMeta(error));
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
