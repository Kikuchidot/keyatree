import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";

export const dynamic = "force-dynamic";

/**
 * URLプレビュー（OGP）取得API。
 * サーバー側でページを取得して title / og:image / og:description を返す。
 * クライアントのCORS制限を回避するためのプロキシ。
 */

const MAX_BYTES = 1024 * 1024; // 1MB まで読み込み
const TIMEOUT_MS = 6000;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 プライベート/リンクローカル/ループバンド
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  // IPv6 ループバンド
  if (h === "::1" || h === "[::1]") return true;
  return false;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function matchMeta(html: string, prop: string): string | null {
  // <meta property="og:..." content="..."> / <meta name="..." content="..."> （属性順両対応）
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(request.url).searchParams.get("url") ?? "";
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "unsupported protocol" }, { status: 400 });
    }
    if (isPrivateHost(parsed.hostname)) {
      return NextResponse.json({ error: "private host not allowed" }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let html = "";
    try {
      const res = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; keyatree-bot/1.0; +url-preview)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) {
        return NextResponse.json({ error: `fetch failed: ${res.status}` }, { status: 502 });
      }
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder("utf-8", { fatal: false });
        let total = 0;
        // ヘッダ付近にOGPがあることが多いため1MB/先頭のみ読む
        while (total < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          html += decoder.decode(value, { stream: true });
        }
      } else {
        html = await res.text();
      }
    } finally {
      clearTimeout(timer);
    }

    const title =
      matchMeta(html, "og:title") ??
      matchMeta(html, "twitter:title") ??
      (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : null) ??
      parsed.hostname;
    const description =
      matchMeta(html, "og:description") ?? matchMeta(html, "description") ?? matchMeta(html, "twitter:description");
    let image = matchMeta(html, "og:image") ?? matchMeta(html, "twitter:image");
    if (image) {
      try {
        image = new URL(image, parsed).toString(); // 相対URL解決
      } catch {
        image = null;
      }
    }

    const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;

    return NextResponse.json(
      {
        url: parsed.toString(),
        hostname: parsed.hostname,
        title: title.slice(0, 200),
        description: description ? description.slice(0, 300) : null,
        image,
        favicon,
      },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (err) {
    const message = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
