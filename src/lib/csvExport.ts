// Aşama 1 — CSV Dışa Aktarım (Excel uyumlu)
// • UTF-8 BOM (\uFEFF) — Türkçe karakter koruması
// • 40 sn sonra URL.revokeObjectURL — bellek sızıntısı önleme

import type { IgUser } from "@/lib/instagramApi";

const CSV_BOM = "\uFEFF";
const REVOKE_DELAY_MS = 40_000;

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** IgUser dizisini CSV satırlarına dönüştürür */
export function usersToCsv(users: IgUser[]): string {
  const header = "id,username,full_name,is_private";
  const rows: string[] = [header];

  for (const user of users) {
    rows.push(
      [
        escapeCsvField(user.id),
        escapeCsvField(user.username),
        escapeCsvField(user.full_name),
        user.is_private ? "true" : "false",
      ].join(",")
    );
  }

  return rows.join("\r\n");
}

/**
 * CSV dosyasını indirir.
 * BOM eklenir; Blob URL 40 saniye sonra revoke edilir.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([CSV_BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}
