import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Escapes special HTML characters in a string to prevent XSS injection
 * into document.write() print windows.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Prevents Excel/LibreOffice formula injection by prefixing cells that start
 * with =, +, -, @, tab, or carriage return with a tab character.
 */
export function sanitizeXlsxCell(value: string | null | undefined): string {
  const s = value ?? "";
  if (s.match(/^[=+\-@\t\r]/)) return `\t${s}`;
  return s;
}
