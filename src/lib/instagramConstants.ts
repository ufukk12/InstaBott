/**
 * Instagram Sabitleri — TARAYICI GÜVENLİ
 *
 * NEDEN AYRI DOSYA: instagramClient.ts tarayıcıda çalışır ama PAGE_SIZE ve
 * MAX_SERVER_REQUEST_DURATION_MS sabitlerine ihtiyaç duyar. Bu sabitler
 * instagramApi.ts içinde dururken, o dosya sunucu tarafı logger'ı (fs kullanır)
 * import ettiği anda tüm istemci paketi `fs`'i çözmeye çalışıp derleme kırıldı.
 *
 * KURAL: Bu dosya SADECE saf değerler içerir. Buraya asla Node.js API'si (fs, path,
 * crypto) kullanan bir modül import edilmemelidir — aksi halde aynı kırılma tekrarlanır.
 */

export const IG_APP_ID = "936619743392459";
export const IG_BASE = "https://i.instagram.com/api/v1";

// Sayfa başına talep edilen kayıt sayısı — 200 ile 100 arasında bilinçli bir orta yol.
//
// GEREKÇE: Instagram bu değeri her zaman karşılamaz, belli bir tavanda kırpar. Tavanın
// ÜSTÜNDEKİ her değer aynı sonucu verir; dolayısıyla yüksek değer hiçbir zaman daha fazla
// istek üretmez. Buna karşılık düşük değer, tavan yukarıdaysa istek sayısını (ve rate-limit
// maruziyetini) doğrudan artırır: 5.000 takipçi → 200'de 25, 150'de 34, 100'de 50 istek.
//
// 150, "küçük sayfalar daha kararlı imleç üretir" hipotezine temkinli bir pay bırakırken
// istek maliyetini sınırlı tutar.
//
// ÖLÇÜM: instagramClient.ts her taramanın sonunda `[sayfa-boyutu]` kaydını loglar.
//   • gözlenen maks == 150  → tavan daha yukarıda, bu değer yükseltilebilir (istek azalır)
//   • gözlenen maks <  150  → gerçek tavan bulundu, bu değerin bir etkisi yok
//
// NOT: Bu sayıyı değiştirmek jitter/tempo profilini ETKİLEMEZ — tempo sayacı istek
// sayısına bağlıdır (bkz. instagramClient.ts → humanDelay), çekilen kişi sayısına değil.
export const PAGE_SIZE = 150;

// İstek timeout — 18 saniye
export const REQUEST_TIMEOUT_MS = 18_000;
// Geçici ağ hatalarında otomatik retry (Instagram API blip koruması)
export const NETWORK_RETRY_MAX = 2;
export const NETWORK_RETRY_DELAY_MS = 1_000;

// igRequest'in olası EN KÖTÜ senaryodaki toplam süresi (tüm denemeler timeout'a uğrarsa):
// (NETWORK_RETRY_MAX + 1) tam timeout + denemeler arası artan bekleme.
// Bu route'ları çağıran client-side fetch timeout'ları bu değerin ALTINDA olmamalı —
// aksi halde sunucu hâlâ meşgulken client erken "NETWORK" hatası fırlatıp gereksiz yere pes eder.
export const MAX_SERVER_REQUEST_DURATION_MS =
  (NETWORK_RETRY_MAX + 1) * REQUEST_TIMEOUT_MS +
  (NETWORK_RETRY_DELAY_MS * NETWORK_RETRY_MAX * (NETWORK_RETRY_MAX + 1)) / 2;
