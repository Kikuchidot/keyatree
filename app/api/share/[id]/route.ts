import { NextResponse } from "next/server";
import { getSharedLink } from "@/lib/shareLinks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|LINE|Discordbot|Whatsapp|TelegramBot|Googlebot|Bingbot|redditbot|Embedly|Quora Link Preview|Outbrain|vkShare|W3C_Validator|Iframely|Pinterest/i;

function isBot(ua: string | null): boolean {
  if (!ua) return false;
  return BOT_UA_PATTERN.test(ua);
}

function isImageType(type?: string, url?: string): boolean {
  if (type?.startsWith("image/")) return true;
  if (url && /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(url)) return true;
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const link = await getSharedLink(id);
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ua = _request.headers.get("user-agent");

  // Bot → OGP メタタグ付き HTML を返す
  if (isBot(ua)) {
    const title = escapeHtml(link.name || "共有ファイル");
    const fileUrl = escapeHtml(link.url);
    const isImage = isImageType(link.type, link.url);
    const ogType = isImage ? "article" : "website";

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>${title} - K.AI</title>
  <meta property="og:title" content="${title}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:url" content="${escapeHtml(_request.url)}">
  ${isImage ? `<meta property="og:image" content="${fileUrl}">` : ""}
  ${isImage ? `<meta property="og:image:width" content="1200">` : ""}
  <meta property="og:description" content="K.AI で共有されたファイル">
  <meta property="og:site_name" content="K.AI (KeyaTree)">
  <meta name="twitter:card" content="${isImage ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${title}">
  ${isImage ? `<meta name="twitter:image" content="${fileUrl}">` : ""}
  <meta http-equiv="refresh" content="0;url=${fileUrl}">
</head>
<body>
  <p>リダイレクト中… <a href="${fileUrl}">${title}</a></p>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // 通常ブラウザ → ファイル URL へリダイレクト
  return NextResponse.redirect(link.url, 302);
}
