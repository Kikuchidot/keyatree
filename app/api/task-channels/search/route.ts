import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import {
  listChannels,
  listArchivedChannels,
  listTalks,
  listTalkMessages,
  listDmChannels,
  isChannelMember,
} from "@/lib/taskChannelStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * チャット横断検索API。
 * アクセス可能なチャンネル・トーク・DMのメッセージから
 * - 本文テキスト
 * - 添付ファイル名
 * - テキスト系ファイルの中身（txt/csv/md/json/log など）
 * を検索して結果を返す。
 */

export type ChatSearchResult = {
  channelId: string;
  channelName: string;
  isDm: boolean;
  talkId: string;
  talkName: string;
  messageId: string;
  authorName: string;
  createdAt: string;
  matchType: "text" | "file";
  snippet: string;
  fileName?: string;
};

const MAX_RESULTS = 50;
const MAX_FILE_BYTES = 512 * 1024; // ファイル本文検索は512KBまで

function isTextLikeFile(name: string, type: string): boolean {
  if (type.startsWith("text/")) return true;
  if (/json|xml|csv|javascript/.test(type)) return true;
  return /\.(txt|csv|md|markdown|json|log|tsv|html?|xml|yml|yaml)$/i.test(name || "");
}

function decodeDataUrlText(dataUrl: string): string | null {
  const idx = dataUrl.indexOf("base64,");
  if (idx === -1) return null;
  try {
    const b64 = dataUrl.slice(idx + 7);
    if (b64.length > MAX_FILE_BYTES * 1.4) return null; // 読みすぎ防止
    return Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

function makeSnippet(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
    if (!q) return NextResponse.json({ results: [] });

    const isAdmin = session.permissionId === "admin";
    const meEmployee = session.employeeId ?? "";
    const results: ChatSearchResult[] = [];

    const addMatch = (r: ChatSearchResult) => {
      if (results.length < MAX_RESULTS) results.push(r);
    };

    // --- 通常チャンネル（+アーカイブ） ---
    const channels = [...(await listChannels()), ...(await listArchivedChannels())];
    for (const channel of channels) {
      if (!isAdmin && !isChannelMember(channel, session)) continue;
      const talks = await listTalks(channel.id);
      for (const talk of talks) {
        const messages = await listTalkMessages(talk.id);
        for (const m of messages) {
          // 本文
          if ((m.text ?? "").toLowerCase().includes(q)) {
            addMatch({
              channelId: channel.id,
              channelName: channel.name,
              isDm: false,
              talkId: talk.id,
              talkName: talk.name,
              messageId: m.id,
              authorName: m.authorName,
              createdAt: m.createdAt,
              matchType: "text",
              snippet: makeSnippet(m.text ?? "", q),
            });
            continue;
          }
          // 添付
          for (const a of m.attachments ?? []) {
            const name = a.name ?? "";
            if (name.toLowerCase().includes(q)) {
              addMatch({
                channelId: channel.id,
                channelName: channel.name,
                isDm: false,
                talkId: talk.id,
                talkName: talk.name,
                messageId: m.id,
                authorName: m.authorName,
                createdAt: m.createdAt,
                matchType: "file",
                snippet: name,
                fileName: name,
              });
              continue;
            }
            if (isTextLikeFile(name, a.type ?? "") && a.dataUrl) {
              const content = decodeDataUrlText(a.dataUrl);
              if (content && content.toLowerCase().includes(q)) {
                addMatch({
                  channelId: channel.id,
                  channelName: channel.name,
                  isDm: false,
                  talkId: talk.id,
                  talkName: talk.name,
                  messageId: m.id,
                  authorName: m.authorName,
                  createdAt: m.createdAt,
                  matchType: "file",
                  snippet: makeSnippet(content, q),
                  fileName: name,
                });
              }
            }
          }
        }
      }
    }

    // --- DM ---
    const dms = await listDmChannels();
    for (const dm of dms) {
      if (!isAdmin && !dm.members.some((m) => m.id === meEmployee)) continue;
      const talks = await listTalks(dm.id);
      for (const talk of talks) {
        const messages = await listTalkMessages(talk.id);
        for (const m of messages) {
          if ((m.text ?? "").toLowerCase().includes(q)) {
            addMatch({
              channelId: dm.id,
              channelName: (dm as typeof dm & { peerName?: string }).peerName ?? "ダイレクトチャット",
              isDm: true,
              talkId: talk.id,
              talkName: talk.name,
              messageId: m.id,
              authorName: m.authorName,
              createdAt: m.createdAt,
              matchType: "text",
              snippet: makeSnippet(m.text ?? "", q),
            });
            continue;
          }
          for (const a of m.attachments ?? []) {
            const name = a.name ?? "";
            if (name.toLowerCase().includes(q) || (isTextLikeFile(name, a.type ?? "") && a.dataUrl && (decodeDataUrlText(a.dataUrl) ?? "").toLowerCase().includes(q))) {
              const content = name.toLowerCase().includes(q) ? name : decodeDataUrlText(a.dataUrl) ?? name;
              addMatch({
                channelId: dm.id,
                channelName: (dm as typeof dm & { peerName?: string }).peerName ?? "ダイレクトチャット",
                isDm: true,
                talkId: talk.id,
                talkName: talk.name,
                messageId: m.id,
                authorName: m.authorName,
                createdAt: m.createdAt,
                matchType: "file",
                snippet: makeSnippet(content, q),
                fileName: name,
              });
            }
          }
        }
      }
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
