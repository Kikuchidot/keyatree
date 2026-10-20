import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { uploadAttachments } from "@/lib/attachmentStorage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/upload-attachment
 *
 * 添付ファイル（base64 data URL）を Supabase Storage にアップロードし、
 * 短い公開 URL を返す。
 *
 * Body: { attachment: { name, dataUrl, type, size }, channelId, talkId }
 * Response: { url: string } | { error: string }
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { attachment, channelId, talkId } = body as {
      attachment?: { name?: string; dataUrl?: string; type?: string; size?: number };
      channelId?: string;
      talkId?: string;
    };

    if (
      !attachment?.dataUrl ||
      typeof attachment.dataUrl !== "string" ||
      !attachment.dataUrl.startsWith("data:") ||
      !channelId ||
      !talkId
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const results = await uploadAttachments(
      [
        {
          name: attachment.name?.slice(0, 160),
          dataUrl: attachment.dataUrl,
          type: attachment.type,
          size: attachment.size,
        },
      ],
      channelId,
      talkId,
    );

    const result = results[0];
    if (!result || result.dataUrl.startsWith("data:")) {
      return NextResponse.json(
        { error: "アップロードに失敗しました（Supabase Storage接続エラー）" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: result.dataUrl });
  } catch (err) {
    console.error("[upload-attachment] error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
