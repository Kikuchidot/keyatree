import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { computeUnread, markTalkRead, markTalkUnreadFrom } from "@/lib/taskChannelStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function meIdOf(session: { employeeId?: string; id?: string } | null): string {
  return (session?.employeeId || session?.id || "") as string;
}

/** ログイン中メンバーの未読数を集計して返す */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const meId = meIdOf(session);
    const summary = await computeUnread(meId);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** トークを現在時刻まで既読にする。unreadFrom 指定時はそのメッセージ以降を未読に戻す */
export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as { talkId?: string; unreadFrom?: string } | null;
    if (!body?.talkId) {
      return NextResponse.json({ error: "talkIdが必要です" }, { status: 400 });
    }
    const meId = meIdOf(session);
    if (typeof body.unreadFrom === "string" && body.unreadFrom) {
      await markTalkUnreadFrom(meId, body.talkId, body.unreadFrom);
    } else {
      await markTalkRead(meId, body.talkId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
