import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { createSharedLink } from "@/lib/shareLinks";

export const dynamic = "force-dynamic";

/**
 * POST /api/share
 *
 * 添付ファイルの短縮共有リンクを生成する。
 *
 * Body: { url: string, name?: string, type?: string }
 * Response: { shortUrl: string } | { error: string }
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, name, type } = body as { url?: string; name?: string; type?: string };

    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const shortId = await createSharedLink({ url, name, type });
    if (!shortId) {
      return NextResponse.json({ error: "共有リンクの作成に失敗しました" }, { status: 500 });
    }

    // ホスト名を動的に取得
    const forwardedHost = request.headers.get("x-forwarded-host");
    const origin = request.headers.get("origin")
      || (forwardedHost ? `https://${forwardedHost}` : null)
      || new URL(request.url).origin;

    const shortUrl = `${origin}/api/share/${shortId}`;

    return NextResponse.json({ shortUrl });
  } catch (err) {
    console.error("[share] error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
