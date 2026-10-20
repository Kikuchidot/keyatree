import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import {
  getChannel,
  getTalk,
  saveTalk,
  isChannelMember,
  listTalkMessages,
  addTalkMessage,
  toggleTalkReaction,
} from "@/lib/taskChannelStore";
import { uploadAttachments } from "@/lib/attachmentStorage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Ctx = { params: Promise<{ channelId: string; talkId: string }> };

async function authorize(channelId: string, talkId: string) {
  const session = await getServerSession();
  if (!session) return { error: "unauthorized", status: 401 as const };
  const channel = await getChannel(channelId);
  if (!channel) return { error: "チャンネルが見つかりません", status: 404 as const };
  const talk = await getTalk(talkId);
  if (!talk || talk.channelId !== channelId) {
    return { error: "トークルームが見つかりません", status: 404 as const };
  }
  const isAdmin = session.permissionId === "admin";
  if (!isAdmin && !isChannelMember(channel, session)) {
    return { error: "権限がありません", status: 403 as const };
  }
  return { session, channel, talk };
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { channelId, talkId } = await ctx.params;
    const channel = await getChannel(channelId);
    const talk = await getTalk(talkId);
    if (!channel || !talk || talk.channelId !== channelId) {
      return NextResponse.json({ error: "トークルームが見つかりません" }, { status: 404 });
    }
    const messages = await listTalkMessages(talkId);
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { channelId, talkId } = await ctx.params;
    const auth = await authorize(channelId, talkId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { session, talk } = auth;

    const body = (await request.json()) as {
      text?: string;
      subject?: string;
      parentId?: string;
      // リアクション操作
      reactionMessageId?: string;
      emoji?: string;
      // 依頼(タスク)起票の告知メッセージ用
      taskId?: string;
      taskTitle?: string;
      kind?: "message" | "system";
      // @メンション（本文中で言及されたメンバー）
      mentions?: { id?: string; name?: string }[];
      // 添付ファイル（data URL）
      attachments?: { name?: string; dataUrl?: string; type?: string; size?: number }[];
      // 引用元メッセージ（現在 or 他のトークルーム）
      quote?: { messageId?: string; talkId?: string; channelId?: string };
    };

    const authorId = session.employeeId ?? session.id ?? "";
    const authorName = session.name ?? "不明";

    // リアクション切り替え
    if (body.reactionMessageId && body.emoji) {
      const messages = await toggleTalkReaction(talkId, body.reactionMessageId, body.emoji, authorId);
      return NextResponse.json({ messages });
    }

    const text = (body.text ?? "").trim();

    // 添付ファイル（data:... 形式・1ファイル最大50MB・最大6件）。画像以外も許可。
    const MAX_ATTACH_CHARS = 70_000_000; // 約50MBのファイル（base64換算）
    const rawAttachments = Array.isArray(body.attachments)
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

    // Supabase Storage にアップロードし、短い公開 URL に差し替え
    const attachments = await uploadAttachments(rawAttachments, channelId, talkId);

    if (!text && attachments.length === 0 && !body.quote?.messageId) {
      return NextResponse.json({ error: "本文・ファイル・引用のいずれかを入力してください" }, { status: 400 });
    }

    // メンションはトークルームの参加メンバーのみ有効にする
    const memberMap = new Map(talk.members.map((m) => [m.id, m.name]));
    const mentions = Array.isArray(body.mentions)
      ? body.mentions
          .filter((m): m is { id: string; name?: string } => Boolean(m?.id) && memberMap.has(m.id as string))
          .map((m) => ({ id: m.id, name: memberMap.get(m.id) ?? m.name ?? "" }))
      : undefined;

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
        const canAccessSrc = session.permissionId === "admin" || isChannelMember(srcChannel, session);
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

    const message = await addTalkMessage({
      talkId,
      channelId,
      authorId,
      authorName,
      text,
      subject: body.subject?.trim() || undefined,
      parentId: body.parentId,
      taskId: body.taskId,
      taskTitle: body.taskTitle,
      kind: body.kind ?? "message",
      mentions,
      attachments,
      quote,
    });
    // トークルームの updatedAt を更新（一覧の並びに反映）
    await saveTalk(talk);
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
