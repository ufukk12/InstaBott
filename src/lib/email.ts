import nodemailer from "nodemailer";

// Gmail SMTP transporter'ı oluşturur
// Not: Gmail'de "Uygulama Şifresi" gereklidir, normal şifre çalışmaz.
// Google Hesabı > Güvenlik > 2 Adımlı Doğrulama (aktif) > Uygulama Şifreleri
function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  // Kritik: Env değişkenleri yoksa sunucu başlamadan hata fırlat
  if (!user || !pass || pass === "16-haneli-uygulama-sifresi") {
    throw new Error(
      "GMAIL_USER ve GMAIL_APP_PASSWORD env değişkenleri doğru şekilde tanımlı değil. " +
      "Bkz: Google Hesabı > Güvenlik > Uygulama Şifreleri"
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function getFromAddress(): string {
  return process.env.GMAIL_USER ?? "noreply@localhost";
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// Tüm e-postalar için ortak temel HTML şablon (Açık pembe - beyaz tema)
// İçerik injection'ı önlemek için dışarıdan gelen değişkenler encode edilmiş URL ya da sayı olmalı
function baseEmailTemplate(title: string, bodyContent: string): string {
  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#fdf8f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdf8f6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #fce7f3;box-shadow:0 8px 30px rgba(236,72,153,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background:linear-gradient(135deg,#ec4899,#f43f5e);">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                📸 Follower Tracker
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #fce7f3;background-color:#fff;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                Bu e-postayı siz talep etmediyseniz güvenle görmezden gelebilirsiniz.<br/>
                © ${new Date().getFullYear()} Instagram Follower Tracker
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// Doğrulama e-postası gönderir
// token: kriptografik olarak üretilmiş URL-güvenli hex string
export async function sendVerificationEmail(
  to: string,
  token: string
): Promise<void> {
  // HATA ÇÖZÜMÜ: Link artık backend api'ye değil, frontend sayfamıza (verify-email) gidiyor
  const verifyUrl = `${getAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  const body = `
    <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:20px;font-weight:700;">
      Hesabınızı Doğrulayın ✨
    </h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.7;">
      Instagram Follower Tracker'a hoş geldiniz! Hesabınızı aktive etmek için
      aşağıdaki butona tıklayın.
    </p>
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:8px 0 28px;">
          <a href="${verifyUrl}"
            style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#ec4899,#f43f5e);
                   color:#ffffff;text-decoration:none;border-radius:50px;font-weight:600;font-size:15px;
                   letter-spacing:0.3px;box-shadow:0 4px 15px rgba(236,72,153,0.3);">
            E-Postamı Doğrula
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;">
      Buton çalışmıyorsa aşağıdaki bağlantıyı tarayıcınıza kopyalayın:
    </p>
    <p style="margin:0;word-break:break-all;">
      <a href="${verifyUrl}" style="color:#ec4899;font-size:12px;">${verifyUrl}</a>
    </p>
    <p style="margin:24px 0 0;padding:16px;background-color:#fdf8f6;border-radius:12px;
              color:#6b7280;font-size:13px;line-height:1.6;border-left:3px solid #f43f5e;">
      ⏰ Bu bağlantı <strong style="color:#1a1a2e;">24 saat</strong> geçerlidir.
    </p>`;

  const html = baseEmailTemplate("E-posta Doğrulama", body);

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Instagram Follower Tracker" <${getFromAddress()}>`,
    to,
    subject: "✅ E-posta Doğrulama - Instagram Follower Tracker",
    html,
    text: `Hesabınızı doğrulamak için: ${verifyUrl} (24 saat geçerlidir)`,
  });
}

// Şifre sıfırlama OTP e-postası gönderir
// otp: 4 haneli sayısal string
export async function sendPasswordResetOtp(
  to: string,
  otp: string
): Promise<void> {
  // OTP'yi HTML'e gömmeden önce sadece rakam olduğunu doğrula (ekstra güvenlik)
  if (!/^\d{4}$/.test(otp)) {
    throw new Error("Geçersiz OTP formatı");
  }

  // Her rakamı ayrı bir kutuya koy (Pembe tasarım)
  const otpDigits = otp
    .split("")
    .map(
      (d) =>
        `<span style="display:inline-block;width:48px;height:56px;line-height:56px;
                       background-color:#fce7f3;border:1px solid #fbcfe8;
                       border-radius:12px;font-size:28px;font-weight:700;color:#ec4899;
                       text-align:center;margin:0 4px;box-shadow:0 2px 8px rgba(236,72,153,0.1);">${d}</span>`
    )
    .join("");

  const body = `
    <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:20px;font-weight:700;">
      Şifre Sıfırlama Kodu 🔐
    </h2>
    <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:1.7;">
      Şifre sıfırlama talebinizi aldık. Aşağıdaki doğrulama kodunu kullanın:
    </p>
    <div style="text-align:center;margin:0 0 28px;">
      ${otpDigits}
    </div>
    <p style="margin:0 0 0;padding:16px;background-color:#fdf8f6;border-radius:12px;
              color:#6b7280;font-size:13px;line-height:1.6;border-left:3px solid #ec4899;">
      ⏰ Bu kod <strong style="color:#1a1a2e;">10 dakika</strong> geçerlidir. Siz talep
      etmediyseniz bu e-postayı görmezden gelin; şifreniz değişmeyecektir.
    </p>`;

  const html = baseEmailTemplate("Şifre Sıfırlama", body);

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Instagram Follower Tracker" <${getFromAddress()}>`,
    to,
    subject: "🔐 Şifre Sıfırlama Kodunuz",
    html,
    text: `Şifre sıfırlama kodunuz: ${otp} (10 dakika geçerlidir)`,
  });
}
