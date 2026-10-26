"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type UnreadData = {
  total: number;
  channelItems: { id: string; name: string; unread: number; talkId?: string; talkName?: string; lastMessageId?: string }[];
  dmItems: { id: string; talkId?: string; peerName: string; unread: number; lastMessageId?: string }[];
  mentionItems: {
    messageId: string;
    talkId: string;
    channelId: string;
    channelName: string;
    talkName: string;
    isDm: boolean;
    peerName?: string;
    authorName: string;
    text: string;
    createdAt: string;
  }[];
};

/** 通知から対象トーク＋トリガーメッセージへ直接ジャンプするURL */
function jumpUrl(channelId: string, talkId?: string, lastMessageId?: string, isDm = false) {
  const p = new URLSearchParams();
  if (talkId) p.set("talk", talkId);
  if (channelId) p.set(isDm ? "dm" : "channel", channelId);
  if (lastMessageId) p.set("msg", lastMessageId);
  return `/tasks/channels?${p.toString()}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * マイページ向け: チャット（チャンネル・トーク・DM）の未読サマリーと
 * 自分宛・@全員のメンション通知を表示する。
 * 通知を押すと、対象トークルームを開き、該当メッセージまでスクロールする。
 */
export default function ChatUnreadPanel() {
  const [data, setData] = useState<UnreadData | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/task-channels/unread")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d) setData(d as UnreadData);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    // チャット画面で未読状態が変わったら即時反映（同一ブラウザのタブ間通知）
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("kt-unread-changed");
      bc.onmessage = () => load();
    } catch {
      /* BroadcastChannel 未対応環境では無視 */
    }
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      bc?.close();
    };
  }, []);

  const mentions = data?.mentionItems ?? [];
  if (!data || (data.total === 0 && mentions.length === 0)) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <div className="bg-white rounded-2xl shadow-sm border p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center text-white text-sm font-bold">
            !
          </span>
          <div>
            <p className="text-sm font-bold text-gray-800">チャット未読</p>
            <p className="text-[11px] text-gray-500">
              チャンネル・トークルーム・ダイレクトチャットに未読メッセージがあります
            </p>
          </div>
        </div>
        <Link
          href="/tasks/channels"
          target="_blank"
          className="text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-full px-4 py-2 transition"
        >
          チャットを開く（{data.total}件）
        </Link>
      </div>

      {/* メンション通知（自分宛・@全員） */}
      {mentions.length > 0 && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-xs font-bold text-emerald-700 mb-2">メンション通知（{mentions.length}件）</p>
          <div className="space-y-1.5">
            {mentions.slice(0, 8).map((m) => (
              <Link
                key={m.messageId}
                href={jumpUrl(m.channelId, m.talkId, m.messageId, m.isDm)}
                target="_blank"
                className="flex items-start gap-2 rounded-lg bg-white border border-emerald-100 px-3 py-2 hover:border-emerald-300 transition"
              >
                <span className="mt-0.5 flex-shrink-0 text-[10px] font-bold text-white bg-emerald-500 rounded px-1.5 py-0.5">
                  @
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-800 truncate">
                    <span className="font-bold">{m.authorName}</span>
                    <span className="text-gray-400"> ｜ </span>
                    <span className="text-gray-600">
                      {m.isDm ? `DM: ${m.peerName ?? ""}` : `${m.channelName} / ${m.talkName}`}
                    </span>
                    <span className="text-gray-400"> ｜ {fmtTime(m.createdAt)}</span>
                  </p>
                  <p className="text-xs text-gray-600 truncate">{m.text}</p>
                </div>
              </Link>
            ))}
            {mentions.length > 8 && (
              <p className="text-[11px] text-emerald-600 px-1">ほか {mentions.length - 8} 件のメンションがあります</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {data.channelItems.slice(0, 5).map((c) => (
          <Link
            key={`${c.id}:${c.talkId ?? ""}`}
            href={jumpUrl(c.id, c.talkId, c.lastMessageId)}
            target="_blank"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition"
          >
            <span className="text-gray-400 text-xs">#</span>
            <span className="text-sm text-gray-700 truncate flex-1">
              {c.name}{c.talkName ? ` / ${c.talkName}` : ""}
            </span>
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
              {c.unread > 99 ? "99+" : c.unread}
            </span>
          </Link>
        ))}
        {data.dmItems.slice(0, 5).map((d) => (
          <Link
            key={d.id}
            href={jumpUrl(d.id, d.talkId, d.lastMessageId, true)}
            target="_blank"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition"
          >
            <span className="w-5 h-5 rounded-full bg-indigo-400 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {d.peerName.charAt(0)}
            </span>
            <span className="text-sm text-gray-700 truncate flex-1">{d.peerName}</span>
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
              {d.unread > 99 ? "99+" : d.unread}
            </span>
          </Link>
        ))}
        {data.channelItems.length + data.dmItems.length > 10 && (
          <p className="text-[11px] text-gray-400 px-2 pt-1">
            ほか {data.channelItems.length + data.dmItems.length - 10} 件の未読があります
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
