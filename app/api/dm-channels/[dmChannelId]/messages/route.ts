import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import {
  getChannel,
  getDmTalk,
  getTalk,
  saveTalk,
  isChannelMember,
  listTalkMessages,
  addTalkMessage,
  toggleTalkReaction,
  deleteTalkMessage,
  updateTalkMessageAttachments,
  updateTalkMessageText,
} from "@/lib/taskChannelStore";
import { uploadAttachments } from "@/lib/attachmentStorage";
import { ALL_MENTION_ID, ALL_MENTION_NAME } from "@/lib/mentions";

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
      parentId?: string;
      reactionMessageId?: string;
      emoji?: string;
      mentions?: { id?: string; name?: string }[];
      attachments?: { name?: string; dataUrl?: string; type?: string; size?: number }[];
      quote?: { messageId?: string; talkId?: string; channelId?: string };
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
    const rawAttachments = Array.isArray(body.attachments)
      ? body.attachments
          .filter(
            (a) =>
              typeof a?.dataUrl === "string" &&
              (a.dataUrl.startsWith("data:") ? a.dataUrl.length <= MAX_ATTACH_CHARS : a.dataUrl.startsWith("http"))
          )
          .slice(0, 6)
          .map((a) => ({
            name: a.name?.slice(0, 160),
            dataUrl: a.dataUrl as string,
            type: typeof a.type === "string" ? a.type.slice(0, 120) : undefined,
            size: typeof a.size === "number" ? a.size : undefined,
          }))
      : [];

    // まだ data URL のものがあれば Supabase Storage にアップロード
    const attachments = await uploadAttachments(rawAttachments, channel.id, talk.id);

    if (!text && attachments.length === 0 && !body.quote?.messageId) {
      return NextResponse.json({ error: "本文・ファイル・引用のいずれかを入力してください" }, { status: 400 });
    }

    // 引用: 参照元メッセージをサーバー側で解決してスナップショット化（改ざん防止）
    let quote: {
      messageId: string;
      talkId: string;
      channelId: string;
      talkName?: string;
      authorName: string;
      text: string;
      createdAt?: string;
    } | undefined;
    const q = body.quote;
    if (q?.messageId && q?.talkId && q?.channelId) {
      const srcChannel = await getChannel(q.channelId);
      const srcTalk = await getTalk(q.talkId);
      if (srcChannel && srcTalk && srcTalk.channelId === q.channelId) {
        const isDmSrc = (srcChannel as typeof srcChannel & { type?: string }).type === "dm";
        const canAccessSrc =
          session.permissionId === "admin" ||
          (isDmSrc ? srcChannel.members.some((m) => m.id === authorId) : isChannelMember(srcChannel, session));
        if (canAccessSrc) {
          const srcMessages = await listTalkMessages(q.talkId);
          const src = srcMessages.find((m) => m.id === q.messageId);
          if (src) {
            quote = {
              messageId: src.id,
              talkId: q.talkId,
              channelId: q.channelId,
              talkName: srcTalk.name,
              authorName: src.authorName,
              text: (src.text || (src.attachments?.length ? "[画像]" : "")).slice(0, 500),
              createdAt: src.createdAt,
            };
          }
        }
      }
    }

    const memberMap = new Map(talk.members.map((m) => [m.id, m.name]));
    const mentions = Array.isArray(body.mentions)
      ? body.mentions
          .filter(
            (m): m is { id: string; name?: string } =>
              Boolean(m?.id) && (m.id === ALL_MENTION_ID || memberMap.has(m.id as string))
          )
          .map((m) => ({
            id: m.id,
            name: m.id === ALL_MENTION_ID ? ALL_MENTION_NAME : (memberMap.get(m.id) ?? m.name ?? ""),
          }))
      : undefined;

    const message = await addTalkMessage({
      talkId: talk.id,
      channelId: channel.id,
      authorId,
      authorName,
      text,
      parentId: body.parentId,
      mentions,
      attachments,
      quote,
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
    // 自分の投稿のみ削除可能（他者の投稿は削除不可）
    const meId = auth.session.employeeId || auth.session.id || "";
    const messages = await listTalkMessages(auth.talk.id);
    const target = messages.find((m) => m.id === messageId);
    if (!target) return NextResponse.json({ error: "メッセージが見つかりません" }, { status: 404 });
    if (target.authorId !== meId) {
      return NextResponse.json({ error: "自分のメッセージのみ削除できます" }, { status: 403 });
    }
    await deleteTalkMessage(auth.talk.id, messageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH: 添付ファイル更新 or メッセージ本文編集
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { dmChannelId } = await ctx.params;
    const auth = await authorize(dmChannelId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { session, talk } = auth;
    const meId = session.employeeId || session.id || "";
    const body = await request.json();
    const messageId = body.messageId;
    if (!messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    const messages = await listTalkMessages(talk.id);
    const target = messages.find((m) => m.id === messageId);
    if (!target) return NextResponse.json({ error: "メッセージが見つかりません" }, { status: 404 });
    if (target.authorId !== meId) {
      return NextResponse.json({ error: "自分のメッセージのみ編集できます" }, { status: 403 });
    }

    // テキスト編集
    if (typeof body.text === "string") {
      const updated = await updateTalkMessageText(talk.id, messageId, body.text);
      return NextResponse.json({ message: updated });
    }

    // 添付ファイル更新
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const updated = await updateTalkMessageAttachments(talk.id, messageId, attachments);
    return NextResponse.json({ message: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
