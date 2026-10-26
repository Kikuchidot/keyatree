import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { computeUnread, markTalkRead } from "@/lib/taskChannelStore";

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

/** トークを現在時刻まで既読にする */
export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as { talkId?: string } | null;
    if (!body?.talkId) {
      return NextResponse.json({ error: "talkIdが必要です" }, { status: 400 });
    }
    const meId = meIdOf(session);
    await markTalkRead(meId, body.talkId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
