import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import {
  getChannel,
  getDmTalk,
  saveTalk,
  listTalkMessages,
  addTalkMessage,
  toggleTalkReaction,
  deleteTalkMessage,
} from "@/lib/taskChannelStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Ctx = { params: Promise<{ dmChannelId: string }> };

async function authorize(dmChannelId: string) {
  const session = await getServerSession();
  if (!session) return { error: "unauthorized", status: 401 as const };
  const channel = await getChannel(dmChannelId);
  if (!channel || (channel as typeof channel & { type?: string }).type !== "dm") {
    return { error: "DMチャンネルが見つかりません", status: 404 as const };
  }
  const meId = session.employeeId || session.id || "";
  if (!channel.members.some((m) => m.id === meId)) {
    return { error: "権限がありません", status: 403 as const };
  }
  const talk = await getDmTalk(dmChannelId);
  if (!talk) return { error: "トークが見つかりません", status: 404 as const };
  return { session, channel, talk };
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { dmChannelId } = await ctx.params;
    const auth = await authorize(dmChannelId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const messages = await listTalkMessages(auth.talk.id);
    return NextResponse.json({ messages, talkId: auth.talk.id, channel: auth.channel });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { dmChannelId } = await ctx.params;
    const auth = await authorize(dmChannelId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { session, channel, talk } = auth;
    const body = (await request.json()) as {
      text?: string;
      reactionMessageId?: string;
      emoji?: string;
      mentions?: { id?: string; name?: string }[];
      attachments?: { name?: string; dataUrl?: string; type?: string; size?: number }[];
    };
    const authorId = session.employeeId ?? session.id ?? "";
    const authorName = session.name ?? "不明";

    // リアクション
    if (body.reactionMessageId && body.emoji) {
      const messages = await toggleTalkReaction(talk.id, body.reactionMessageId, body.emoji, authorId);
      return NextResponse.json({ messages });
    }

    const text = (body.text ?? "").trim();
    const MAX_ATTACH_CHARS = 70_000_000;
    const attachments = Array.isArray(body.attachments)
      ? body.attachments
          .filter(
            (a) =>
              typeof a?.dataUrl === "string" &&
              a.dataUrl.startsWith("data:") &&
              a.dataUrl.length <= MAX_ATTACH_CHARS
          )
          .slice(0, 6)
          .map((a) => ({
            name: a.name?.slice(0, 160),
            dataUrl: a.dataUrl as string,
            type: typeof a.type === "string" ? a.type.slice(0, 120) : undefined,
            size: typeof a.size === "number" ? a.size : undefined,
          }))
      : [];

    if (!text && attachments.length === 0) {
      return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
    }

    const memberMap = new Map(talk.members.map((m) => [m.id, m.name]));
    const mentions = Array.isArray(body.mentions)
      ? body.mentions
          .filter((m): m is { id: string; name?: string } => Boolean(m?.id) && memberMap.has(m.id as string))
          .map((m) => ({ id: m.id, name: memberMap.get(m.id) ?? m.name ?? "" }))
      : undefined;

    const message = await addTalkMessage({
      talkId: talk.id,
      channelId: channel.id,
      authorId,
      authorName,
      text,
      mentions,
      attachments,
    });
    await saveTalk(talk);
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const { dmChannelId } = await ctx.params;
    const auth = await authorize(dmChannelId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const url = new URL(request.url);
    const messageId = url.searchParams.get("messageId");
    if (!messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    await deleteTalkMessage(auth.talk.id, messageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
