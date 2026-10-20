import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { listDmChannels, findOrCreateDm, getDmTalk, listTalkMessages } from "@/lib/taskChannelStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const meId = session.employeeId || session.id || "";
    const allDms = await listDmChannels();
    // 自分が参加しているDMのみ返す
    const myDms = allDms.filter((c) => c.members.some((m) => m.id === meId));
    // 各DMの最新メッセージと未読情報を付与
    const result = await Promise.all(
      myDms.map(async (c) => {
        const talk = await getDmTalk(c.id);
        let lastMessage: string | undefined;
        let lastMessageAt: string | undefined;
        let messageCount = 0;
        if (talk) {
          const msgs = await listTalkMessages(talk.id);
          messageCount = msgs.length;
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            lastMessage = last.text || (last.attachments?.length ? "[添付ファイル]" : "");
            lastMessageAt = last.createdAt;
          }
        }
        // 相手のメンバー情報
        const peer = c.members.find((m) => m.id !== meId) ?? c.members[0];
        return {
          ...c,
          talkId: talk?.id,
          peer: { id: peer.id, name: peer.name },
          lastMessage,
          lastMessageAt,
          messageCount,
        };
      })
    );
    // 最新メッセージ順でソート
    result.sort((a, b) => (b.lastMessageAt ?? b.updatedAt).localeCompare(a.lastMessageAt ?? a.updatedAt));
    return NextResponse.json({ dmChannels: result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) as { recipientId?: string; recipientName?: string };
    if (!body.recipientId || !body.recipientName) {
      return NextResponse.json({ error: "相手を選択してください" }, { status: 400 });
    }
    const meId = session.employeeId || session.id || "";
    const meName = session.name ?? "不明";
    if (meId === body.recipientId) {
      return NextResponse.json({ error: "自分自身にDMは送れません" }, { status: 400 });
    }
    const { channel, talk } = await findOrCreateDm({
      user1: { id: meId, name: meName },
      user2: { id: body.recipientId, name: body.recipientName },
    });
    return NextResponse.json({ channel, talkId: talk.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
