import { prisma as db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';

/**
 * Kota okuma fonksiyonları hem normal Prisma client'ı hem de bir transaction
 * client'ı kabul eder. Böylece consumeAnalysisCredit, kota kararını kesintiyle
 * AYNI transaction içinde alabilir (karar ile kesinti arasına başka bir istek giremez).
 */
type DbClient = Prisma.TransactionClient;

/** Bakiye/kota yetersizliğini diğer sunucu hatalarından ayıran özel hata tipi. */
export class InsufficientBalanceError extends Error {
  readonly code = 'INSUFFICIENT_BALANCE';
  // message birebir 'Yetersiz bakiye' bırakıldı — mesaja bakan eski kontroller çalışmaya devam eder.
  constructor(message = 'Yetersiz bakiye') {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export interface ConsumeResult {
  /** true → cüzdandan gerçekten 1 FollowerToken düşüldü. false → ücretsiz hak kullanıldı. */
  consumedToken: boolean;
  /** Kesinti sonrası kalan bakiye (UI'a anlık gösterim için). */
  tokensRemaining: number;
  /** Oluşturulan UsageLog kaydının id'si — iade (refund) gerekirse bu kayıt geri alınır. */
  usageLogId: string;
}

export interface QuotaResult {
  allowed: boolean;
  reason?: 'TOKEN_REQUIRED' | 'RATE_LIMIT' | 'COOLDOWN';
  dailyUsed: number;
  monthlyUsed: number;
  tokensRemaining: number;
  willConsumeToken: boolean;
  nextAvailableAt?: string;
}

export interface UserCreditInfo {
  displayId: string;
  email: string;
  followerTokens: number;
  createdAt: string;      // ISO tarih string
  todayUsage: number;
  monthUsage: number;
  dailyFreeRemaining: number;
  monthlyFreeRemaining: number;
  isVip: boolean;
}

// 7 karakterli alfanümerik benzersiz ID oluşturma
export async function generateDisplayId(): Promise<string> {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let displayId = '';
  let isUnique = false;

  while (!isUnique) {
    displayId = Array.from(crypto.randomFillSync(new Uint8Array(7)))
      .map((x) => chars[x % chars.length])
      .join('');

    const existingUser = await db.user.findUnique({
      where: { displayId },
    });

    if (!existingUser) {
      isUnique = true;
    }
  }

  return displayId;
}

// Günlük (1) ve Aylık (3) limitlerin kontrolü ile 3 saatlik cooldown hesaplaması
export async function checkQuota(
  userId: string,
  type: 'normal' | 'ghost' = 'normal',
  client: DbClient = db
): Promise<QuotaResult> {
  const credits = await getUserCredits(userId, client);

  const result: QuotaResult = {
    allowed: false,
    dailyUsed: credits.todayUsage,
    monthlyUsed: credits.monthUsage,
    tokensRemaining: credits.followerTokens,
    willConsumeToken: false,
  };

  // VIP Kontrolü
  if (credits.isVip) {
    result.allowed = true;
    return result;
  }

  // Ücretsiz hakka uygun mu? (Aylık hakkı dolmamış VE günlük hakkı dolmamış olmalı)
  const isFreeEligible = type === 'normal' && credits.monthlyFreeRemaining > 0 && credits.dailyFreeRemaining > 0;

  if (isFreeEligible) {
    result.allowed = true;
    result.willConsumeToken = false;
    return result;
  }

  // Ücretli ise Token kontrolü
  if (credits.followerTokens > 0) {
    result.allowed = true;
    result.willConsumeToken = true;
    return result;
  }

  // Yetersiz bakiye
  result.allowed = false;
  result.reason = 'TOKEN_REQUIRED';
  return result;
}

/**
 * Analiz kredisini TEK ve ATOMİK bir işlemde tüketir.
 *
 * Sıralama kritik — üç adım tek transaction içinde, tam bu sırayla çalışır:
 *   1. KARAR   : checkQuota, kullanım logu HENÜZ yazılmadan okunur.
 *   2. KESİNTİ : koşullu updateMany (followerTokens > 0) ile atomik decrement.
 *   3. LOG     : UsageLog en son yazılır.
 *
 * Bu sıra önceden terstiydi (önce logUsage, sonra deductCredit): checkQuota kendi
 * yazdığı logu sayıp "günlük ücretsiz hak tükendi" sonucuna varıyor ve bakiyesi olan
 * kullanıcıdan ücretsiz analizinde bile token kesiyordu.
 *
 * Kesinti `updateMany({ where: { followerTokens: { gt: 0 } } })` ile yapılır; eski
 * findUnique→update ikilisindeki kontrol-ile-yazma arası yarış penceresi böylece kapanır
 * ve bakiye hiçbir eşzamanlılık senaryosunda negatife düşemez.
 */
export async function consumeAnalysisCredit(
  userId: string,
  type: 'normal' | 'ghost' = 'normal'
): Promise<ConsumeResult> {
  return db.$transaction(
    async (tx) => {
      // 1. KARAR — log yazılmadan önce okunur
      const quota = await checkQuota(userId, type, tx);

      if (!quota.allowed) {
        throw new InsufficientBalanceError();
      }

      let consumedToken = false;
      let tokensRemaining = quota.tokensRemaining;

      // 2. ATOMİK KESİNTİ — VIP ve ücretsiz hak kullananlarda hiç çalışmaz
      if (quota.willConsumeToken) {
        const updated = await tx.user.updateMany({
          where: { id: userId, followerTokens: { gt: 0 } },
          data: { followerTokens: { decrement: 1 } },
        });

        // count === 0 → araya giren başka bir istek bakiyeyi tüketmiş
        if (updated.count === 0) {
          throw new InsufficientBalanceError();
        }

        consumedToken = true;
        tokensRemaining = Math.max(0, quota.tokensRemaining - 1);
      }

      // 3. LOG — en son; kota kararını artık etkileyemez
      const log = await tx.usageLog.create({
        data: { userId, type },
        select: { id: true },
      });

      return { consumedToken, tokensRemaining, usageLogId: log.id };
    },
    // getUserCredits birkaç sorgu çalıştırdığı için varsayılan 5sn'lik sınır yükseltildi
    { timeout: 10_000 }
  );
}

/**
 * consumeAnalysisCredit ile alınan krediyi iade eder: kullanım logunu siler ve
 * gerçekten token düşüldüyse bakiyeye geri ekler.
 *
 * Log silme işlemi ÖNCE yapılır ve count === 0 ise erken çıkılır — bu, fonksiyon
 * yanlışlıkla iki kez çağrılsa bile çift iade yapılmasını engelleyen idempotency korumasıdır.
 *
 * NOT: Bu fonksiyon şu an hiçbir yerden çağrılmıyor. Adım 5'te (Graceful Shutdown)
 * devreye alınmak üzere hazırlandı — mevcut davranışı değiştirmez.
 */
export async function refundAnalysisCredit(
  userId: string,
  usageLogId: string,
  consumedToken: boolean
): Promise<void> {
  await db.$transaction(async (tx) => {
    const deleted = await tx.usageLog.deleteMany({ where: { id: usageLogId, userId } });

    // Kayıt yoksa iade zaten yapılmış demektir — ikinci kez token ekleme
    if (deleted.count === 0) return;

    if (consumedToken) {
      await tx.user.update({
        where: { id: userId },
        data: { followerTokens: { increment: 1 } },
      });
    }
  });
}

// Kullanıcı kredi ve kullanım bilgisini getirir
export async function getUserCredits(userId: string, client: DbClient = db): Promise<UserCreditInfo> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { displayId: true, email: true, followerTokens: true, role: true, createdAt: true },
  });

  if (!user) throw new Error('Kullanıcı bulunamadı');

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const normalTypes = ['analysis', 'normal'];

  const [monthLogs, userTodayLogs] = await Promise.all([
    client.usageLog.findMany({
      where: {
        userId,
        type: { in: normalTypes },
        usedAt: { gte: startOfMonth },
      },
      orderBy: { usedAt: 'asc' },
    }),
    client.usageLog.count({
      where: {
        userId,
        type: { in: normalTypes },
        usedAt: { gte: startOfDay },
      },
    }),
  ]);

  let freeUsedThisMonth = 0;
  let freeUsedToday = 0;
  let lastFreeDay = '';

  for (const log of monthLogs) {
    const logDay = log.usedAt.toISOString().split('T')[0];
    // Aynı gün içinde 1'den fazla bedava verilmez. Aylık 3'e kadar bedava verilir.
    if (logDay !== lastFreeDay && freeUsedThisMonth < 3) {
      freeUsedThisMonth++;
      lastFreeDay = logDay;
      if (log.usedAt >= startOfDay) {
        freeUsedToday++;
      }
    }
  }

  const isVip = user.email === 'ufku795@gmail.com' || user.role === 'admin';
  const dailyFreeRemaining = isVip ? 999 : Math.max(0, 1 - freeUsedToday);
  const monthlyFreeRemaining = isVip ? 999 : Math.max(0, 3 - freeUsedThisMonth);

  return {
    displayId: user.displayId,
    email: user.email,
    followerTokens: user.followerTokens,
    createdAt: user.createdAt.toISOString(),
    todayUsage: userTodayLogs,
    monthUsage: monthLogs.length,
    dailyFreeRemaining,
    monthlyFreeRemaining,
    isVip,
  };
}
