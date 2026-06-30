# Instagram Follower Tracker — Proje Hafızası

## Proje Amacı
Fake Instagram hesabının session cookie'si ile hedef hesabı analiz eden web uygulaması. Geri takip etmeyenleri ve son 5 postu beğenmeyenleri tespit eder.

## Stack
- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Prisma ORM
- JWT auth, bcrypt şifre hash, Nodemailer (Gmail SMTP)
- Tailwind CSS (frontend henüz yok)

## Klasör Yapısı
```
prisma/schema.prisma     → User, PasswordReset modelleri
src/lib/db.ts            → Prisma client singleton
src/lib/auth.ts          → JWT, bcrypt, Zod şemalar, rate limit, yardımcılar
src/lib/email.ts         → Doğrulama & OTP e-posta gönderimi (profesyonel HTML şablon)
src/app/api/auth/        → Auth endpoint'leri
src/app/api/health/      → Sağlık kontrolü (DB ping dahil)
```

## Görev 1 — Backend Auth (Tamamlandı ✅)
- **Register** `POST /api/auth/register` — email+password, isVerified=false, doğrulama maili
- **Verify Email** `GET/POST /api/auth/verify-email` — token ile doğrulama
- **Login** `POST /api/auth/login` — JWT döner, doğrulanmamış hesap reddedilir
- **Forgot Password** `POST /api/auth/forgot-password` — 4 haneli OTP (10 dk)
- **Verify OTP** `POST /api/auth/verify-otp` — OTP doğrulanır, used=true yapılır, geçici resetToken döner (15 dk)
- **Reset Password** `POST /api/auth/reset-password` — resetToken ile şifre sıfırlama (artık OTP kabul etmez)

## Şifre Sıfırlama Akışı (Güncel)
```
forgot-password (email) →
  [DB: otp + expiresAt]
verify-otp (email + otp) →
  [DB: otp=used, resetToken + resetTokenExpires] →
  [FE: resetToken alır]
reset-password (resetToken + newPassword) →
  [DB: şifre güncellenir, resetTokenUsed=true]
```

## Güvenlik (Eklenen / Düzeltilen)
- Rate limit (IP + email bazlı, bellek içi)
- Zod ile input sanitization
- E-posta enumeration koruması (register/forgot)
- Tüm hassas değerler .env'de
- JSON parse hataları tüm route'larda handle ediliyor
- OTP double-spend açığı kapatıldı (resetToken akışı)
- OTP HTML'e gömülmeden önce format doğrulaması
- Health route DB bağlantısını ping'liyor, sorun varsa 503 dönüyor

## Prisma Schema Değişiklikleri (Görev 1 Güncellemesi)
PasswordReset modeline eklendi:
- `resetToken String?` — verify-otp sonrası üretilen geçici token
- `resetTokenExpires DateTime?` — token geçerlilik süresi (15 dk)
- `resetTokenUsed Boolean` — token kullanıldı mı?
- `@@index([resetToken])` — hızlı arama

## ENV Değişkenleri
```
DATABASE_URL         → PostgreSQL bağlantı stringi
JWT_SECRET           → Min 32 karakter rastgele string
NEXT_PUBLIC_APP_URL  → Doğrulama linkleri için base URL
GMAIL_USER           → Gmail adresi (ör: ornek@gmail.com)
GMAIL_APP_PASSWORD   → 16 haneli Google Uygulama Şifresi (normal şifre DEĞİL)
NODE_ENV             → development | production
```

## Sonraki Adımlar
- ~~Frontend UI (Landing Page)~~ ✅ Tamamlandı
- ~~Auth sayfaları (Login, Register, Forgot Password, Verify Email)~~ ✅ Tamamlandı
- Instagram session cookie analiz modülü
- IndexedDB / analiz sonuçları

## Görev 2 — Frontend Landing Page (Tamamlandı ✅)
Değiştirilen dosyalar:
- `src/app/globals.css` — Tam tasarım sistemi: CSS token'ları, keyframe animasyonlar, card/button stilleri
- `src/app/layout.tsx` — SEO meta, OpenGraph, Google Fonts preconnect
- `src/app/page.tsx` — Landing Page bileşeni (`"use client"`, IntersectionObserver ile scroll-reveal)

Sayfa bölümleri:
1. Sticky Navbar (blur backdrop, logo, Giriş Yap butonu)
2. Hero (gradient başlık, alt başlık, pulse-ring CTA, floating ikon cluster)
3. İstatistikler Şeridi (10sn / %100 / 3'ü 1 arada)
4. 3 Özellik Kartı (hover animasyonlu, shimmer badge)
5. "3 Adımda Hazır" Steps bölümü
6. Alt CTA kutusu (güven mühürleri ile)
7. Footer

Renk paleti: beyaz (#ffffff), açık pembe (#fce7f3 → #fbcfe8), pembe aksan (#ec4899, #f43f5e)
Animasyonlar: fadeIn, fadeInUp, floatY, pulseRing, shimmer, scroll-reveal (IntersectionObserver)
Tüm CTA butonlar /login rotasına yönlendirir (henüz oluşturulmadı)

