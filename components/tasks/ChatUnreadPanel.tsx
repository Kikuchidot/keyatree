"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type UnreadData = {
  total: number;
  channelItems: { id: string; name: string; unread: number; talkId?: string; talkName?: string; lastMessageId?: string }[];
  dmItems: { id: string; talkId?: string; peerName: string; unread: number; lastMessageId?: string }[];
};

/** 通知から対象トーク＋トリガーメッセージへ直接ジャンプするURL */
function jumpUrl(channelId: string, talkId?: string, lastMessageId?: string, isDm = false) {
  const p = new URLSearchParams();
  if (talkId) p.set("talk", talkId);
  if (channelId) p.set(isDm ? "dm" : "channel", channelId);
  if (lastMessageId) p.set("msg", lastMessageId);
  return `/tasks/channels?${p.toString()}`;
}

/**
 * マイページ向け: チャット（チャンネル・トーク・DM）の未読サマリーを表示する。
 * 未読が0件のときはパネル自体を表示しない。
 * 通知を押すと、未読の発生したトークルームを開き、トリガーとなったメッセージまでスクロールする。
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
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!data || data.total === 0) return null;

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
