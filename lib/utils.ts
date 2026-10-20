import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 氏名中の全角スペース（\u3000）を半角スペースに統一する。
 * 連続スペースも1つの半角スペースに正規化し、前後の空白を除去する。
 */
export function normalizeName(name: string): string {
  return name.replace(/[\u3000]/g, " ").replace(/\s{2,}/g, " ").trim();
}
