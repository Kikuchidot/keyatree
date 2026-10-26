"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import MemberPicker from "@/components/tasks/MemberPicker";
import AddMembersModal from "@/components/tasks/AddMembersModal";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import MentionTextarea from "@/components/tasks/MentionTextarea";
import { extractMentions } from "@/lib/mentions";
import { renderRichMessage } from "@/lib/messageFormat";
import { resizeImageToDataUrl, fileToDataUrl } from "@/lib/clientImage";
import { STATUS_CONFIG, formatDeadline, type FullTask } from "@/lib/taskStore";
import { apiListTasks } from "@/lib/taskClient";
import { reminderLevel, REMINDER_STYLE } from "@/lib/taskReminder";
import { getClientSession, isAdminSession, sessionMemberId, type SessionInfo } from "@/lib/clientSession";
import { getOrder, setOrder, applyManualOrder, moveInOrder, getHiddenIds, toggleHiddenId } from "@/lib/uiPrefs";

type ChannelMember = { id: string; name: string; role: "admin" | "member"; joinedAt: string };
type Channel = { id: string; name: string; description?: string; members: ChannelMember[]; createdAt: string; updatedAt: string };
type TalkMember = { id: string; name: string; joinedAt: string };
type Talk = { id: string; channelId: string; name: string; description?: string; members: TalkMember[]; updatedAt: string };
type TalkMessageReaction = { emoji: string; userIds: string[] };
type TalkQuote = {
  messageId: string;
  talkId: string;
  channelId: string;
  talkName?: string;
  authorName: string;
  text: string;
  createdAt?: string;
};
type TalkMessage = {
  id: string;
  talkId: string;
  channelId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  reactions?: TalkMessageReaction[];
  mentions?: { id: string; name: string }[];
  attachments?: { name?: string; dataUrl: string; type?: string; size?: number }[];
  quote?: TalkQuote;
  subject?: string;
  parentId?: string;
  taskId?: string;
  taskTitle?: string;
  kind?: "message" | "system";
  editedAt?: string;
};

type DmChannel = Channel & {
  talkId?: string;
  peer: { id: string; name: string };
  lastMessage?: string;
  lastMessageAt?: string;
  messageCount: number;
};

type Selection =
  | { type: "channel"; channelId: string }
  | { type: "talk"; channelId: string; talkId: string }
  | { type: "dm"; dmChannelId: string; talkId: string; peer: { id: string; name: string } }
  | null;

const ICON_COLORS = [
  "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500", "bg-teal-500",
  "bg-cyan-500", "bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-fuchsia-500", "bg-pink-500",
];
function colorFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ICON_COLORS[h % ICON_COLORS.length];
}

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 未読数バッジ（0件は非表示） */
function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

type TalkAttachmentT = { name?: string; dataUrl: string; type?: string; size?: number };

const isImageAttachment = (a: TalkAttachmentT) =>
  (a.type?.startsWith("image/") ?? false) || a.dataUrl.startsWith("data:image/") || /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(a.dataUrl);

const formatBytes = (n?: number) => {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const fileIcon = (a: TalkAttachmentT) => {
  const t = (a.type || "").toLowerCase();
  const name = (a.name || "").toLowerCase();
  if (t.includes("pdf") || name.endsWith(".pdf")) return "📕";
  if (t.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "📘";
  if (t.includes("sheet") || t.includes("excel") || name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "📗";
  if (t.includes("presentation") || name.endsWith(".ppt") || name.endsWith(".pptx")) return "📙";
  if (t.includes("zip") || name.endsWith(".zip") || name.endsWith(".rar") || name.endsWith(".7z")) return "🗜️";
  if (t.startsWith("video/")) return "🎬";
  if (t.startsWith("audio/")) return "🎵";
  if (t.startsWith("text/") || name.endsWith(".txt")) return "📄";
  return "📎";
};

// 添付ファイルをサーバー経由で Supabase Storage にアップロードし、dataUrl を公開 URL に差し替え
async function uploadAttachmentsToStorage(atts: TalkAttachmentT[], channelId: string, talkId: string): Promise<TalkAttachmentT[]> {
  const results: TalkAttachmentT[] = [];
  for (const att of atts) {
    if (!att.dataUrl.startsWith("data:")) {
      results.push(att);
      continue;
    }
    try {
      const res = await fetch("/api/upload-attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachment: att, channelId, talkId }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.url && !d.url.startsWith("data:")) {
          results.push({ ...att, dataUrl: d.url });
          continue;
        }
      }
    } catch { /* fall through to data URL fallback */ }
    results.push(att);
  }
  return results;
}

// モーダル付き添付ファイルビューア
function AttachmentViewer({
  attachments,
  messageId,
  isMine,
  onDeleteAttachment,
}: {
  attachments?: TalkAttachmentT[];
  messageId: string;
  isMine: boolean;
  onDeleteAttachment?: (messageId: string, index: number) => void;
}) {
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (modalIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalIndex(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [modalIndex]);

  if (!attachments || attachments.length === 0) return null;

  const handleDownload = (a: TalkAttachmentT) => {
    if (a.dataUrl.startsWith("data:")) {
      const link = document.createElement("a");
      link.href = a.dataUrl;
      link.download = a.name || "file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Storage URL: fetch して Blob 化し、ダウンロード
      fetch(a.dataUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = a.name || "file";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        })
        .catch(() => {
          // fallback: 新しいタブで開く
          window.open(a.dataUrl, "_blank");
        });
    }
  };

  const handleCopyLink = async (a: TalkAttachmentT) => {
    let urlToCopy = a.dataUrl;

    // Storage URL の場合、短縮 URL を生成
    if (a.dataUrl.startsWith("http")) {
      try {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: a.dataUrl, name: a.name, type: a.type }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.shortUrl) urlToCopy = d.shortUrl;
        }
      } catch { /* 失敗時は元のURLをコピー */ }
    }

    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = urlToCopy;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = (index: number) => {
    if (!onDeleteAttachment) return;
    if (!confirm("この添付ファイルを削除しますか？")) return;
    onDeleteAttachment(messageId, index);
  };

  const current = modalIndex !== null ? attachments[modalIndex] : null;

  return (
    <>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {attachments.map((a, i) =>
          isImageAttachment(a) ? (
            <div key={i} className="relative group/attach">
              <button
                onClick={() => setModalIndex(i)}
                className="block rounded-lg overflow-hidden border border-gray-300 hover:border-emerald-500 transition cursor-pointer"
                title={a.name || "画像を拡大"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.dataUrl} alt={a.name || "添付画像"} className="max-h-56 max-w-[280px] object-contain bg-white" />
              </button>
              {isMine && onDeleteAttachment && (
                <button
                  onClick={() => handleDelete(i)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center opacity-0 group-hover/attach:opacity-100 transition shadow"
                  title="添付を削除"
                >
                  x
                </button>
              )}
            </div>
          ) : (
            <div key={i} className="relative group/attach">
              <button
                onClick={() => setModalIndex(i)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-100 hover:border-emerald-500 hover:bg-gray-100 transition px-3 py-2 max-w-[280px] cursor-pointer"
                title={`${a.name || "ファイル"} を表示`}
              >
                <span className="text-xl flex-shrink-0">{fileIcon(a)}</span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-[13px] text-gray-800">{a.name || "ファイル"}</span>
                  <span className="block text-[11px] text-gray-500">{formatBytes(a.size) || "クリックで詳細"}</span>
                </span>
              </button>
              {isMine && onDeleteAttachment && (
                <button
                  onClick={() => handleDelete(i)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center opacity-0 group-hover/attach:opacity-100 transition shadow"
                  title="添付を削除"
                >
                  x
                </button>
              )}
            </div>
          )
        )}
      </div>

      {/* モーダル */}
      {current && modalIndex !== null && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onClick={() => setModalIndex(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-bold text-gray-800 truncate max-w-[50vw]">
                {current.name || (isImageAttachment(current) ? "画像" : "ファイル")}
                {current.size ? ` (${formatBytes(current.size)})` : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(current)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                  title="ダウンロード"
                >
                  ダウンロード
                </button>
                <button
                  onClick={() => handleCopyLink(current)}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition relative"
                  title="リンクをコピー"
                >
                  {copied ? "コピーしました" : "リンクをコピー"}
                </button>
                <button
                  onClick={() => setModalIndex(null)}
                  className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-600 text-lg flex items-center justify-center transition"
                  title="閉じる"
                >
                  x
                </button>
              </div>
            </div>
            {/* コンテンツ */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-50 min-h-[200px]">
              {isImageAttachment(current) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.dataUrl}
                  alt={current.name || "添付画像"}
                  className="max-w-full max-h-[75vh] object-contain"
                />
              ) : (
                <div className="text-center py-10">
                  <span className="text-6xl block mb-4">{fileIcon(current)}</span>
                  <p className="text-lg font-bold text-gray-800">{current.name || "ファイル"}</p>
                  <p className="text-sm text-gray-500 mt-1">{formatBytes(current.size)}</p>
                  <button
                    onClick={() => handleDownload(current)}
                    className="mt-4 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition"
                  >
                    ダウンロード
                  </button>
                </div>
              )}
            </div>
            {/* ナビゲーション（複数ファイルの場合） */}
            {attachments.length > 1 && (
              <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-gray-200">
                <button
                  onClick={() => setModalIndex((modalIndex - 1 + attachments.length) % attachments.length)}
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold transition"
                >
                  &lt; 前へ
                </button>
                <span className="text-xs text-gray-500">{modalIndex + 1} / {attachments.length}</span>
                <button
                  onClick={() => setModalIndex((modalIndex + 1) % attachments.length)}
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold transition"
                >
                  次へ &gt;
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// 旧互換ラッパー（isMine/onDelete不要な箇所向け）
function renderAttachments(attachments?: TalkAttachmentT[]) {
  if (!attachments || attachments.length === 0) return null;
  return <AttachmentViewer attachments={attachments} messageId="" isMine={false} />;
}

// 引用ブロックを表示（現在 or 他トークルームのメッセージを参照）
function renderQuote(quote?: TalkQuote, currentTalkId?: string) {
  if (!quote) return null;
  const otherRoom = quote.talkId !== currentTalkId;
  return (
    <div className="mt-0.5 mb-1 border-l-2 border-emerald-500/60 bg-gray-50 rounded-r-md px-3 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-300/90">
        <span>❝ 引用</span>
        <span className="font-bold text-gray-700">{quote.authorName}</span>
        {otherRoom && quote.talkName && (
          <span className="text-gray-500">＠{quote.talkName}</span>
        )}
        {quote.createdAt && <span className="text-gray-500">{fmt(quote.createdAt)}</span>}
      </div>
      <p className="mt-0.5 text-[12px] text-gray-600 whitespace-pre-wrap break-words line-clamp-4">{quote.text}</p>
    </div>
  );
}

// 本文中の @メンションをハイライト表示する


export default function ChannelsWorkspacePage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [talksByChannel, setTalksByChannel] = useState<Record<string, Talk[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection>(null);
  const [search, setSearch] = useState("");
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [talkModalChannel, setTalkModalChannel] = useState<Channel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "channel"; channel: Channel } | { type: "talk"; channelId: string; talk: Talk } | null>(null);

  // 並べ替え / 非表示
  const [channelOrder, setChannelOrder] = useState<string[]>([]);
  const [hiddenChannels, setHiddenChannels] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [dragChannel, setDragChannel] = useState<string | null>(null);
  const [dragOverChannel, setDragOverChannel] = useState<string | null>(null);
  const [dragTalk, setDragTalk] = useState<{ channelId: string; talkId: string } | null>(null);
  const [dragOverTalk, setDragOverTalk] = useState<string | null>(null);

  // ダイレクトチャット
  const [dmChannels, setDmChannels] = useState<DmChannel[]>([]);
  const [archivedChannels, setArchivedChannels] = useState<Channel[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"channels" | "dm">("channels");

  // 未読管理（チャンネル・トーク・DMの未読数）
  const [unread, setUnread] = useState<{ byTalk: Record<string, number>; byChannel: Record<string, number>; total: number }>({ byTalk: {}, byChannel: {}, total: 0 });

  // リネームモーダル
  const [renameTarget, setRenameTarget] = useState<{
    type: "channel" | "talk";
    channelId: string;
    talkId?: string;
    currentName: string;
  } | null>(null);

  const isAdmin = isAdminSession(session);
  const meId = sessionMemberId(session);

  const startRenameChannel = (c: Channel) => {
    setRenameTarget({ type: "channel", channelId: c.id, currentName: c.name });
  };
  const startRenameTalk = (t: Talk) => {
    setRenameTarget({ type: "talk", channelId: t.channelId, talkId: t.id, currentName: t.name });
  };
  const handleRenameSubmit = async (newName: string) => {
    if (!renameTarget) return;
    if (renameTarget.type === "channel") {
      const res = await fetch(`/api/task-channels/${renameTarget.channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const d = await res.json();
      if (res.ok) {
        setChannels((prev) => prev.map((x) => (x.id === renameTarget.channelId ? d.channel : x)));
      } else throw new Error(d?.error ?? "名称変更に失敗しました");
    } else {
      const res = await fetch(`/api/task-channels/${renameTarget.channelId}/talks/${renameTarget.talkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const d = await res.json();
      if (res.ok) {
        setTalksByChannel((prev) => ({
          ...prev,
          [renameTarget.channelId]: (prev[renameTarget.channelId] ?? []).map((x) => (x.id === renameTarget.talkId ? d.talk : x)),
        }));
      } else throw new Error(d?.error ?? "名称変更に失敗しました");
    }
  };

  // ---- 削除 ----
  const deleteChannelAction = (c: Channel) => {
    setDeleteTarget({ type: "channel", channel: c });
  };

  const deleteTalkAction = (channelId: string, t: Talk) => {
    setDeleteTarget({ type: "talk", channelId, talk: t });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "channel") {
      const c = deleteTarget.channel;
      const res = await fetch(`/api/task-channels/${c.id}`, { method: "DELETE" });
      if (res.ok) {
        setChannels((prev) => prev.filter((x) => x.id !== c.id));
        setTalksByChannel((prev) => {
          const next = { ...prev };
          delete next[c.id];
          return next;
        });
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(c.id);
          return next;
        });
        if (selection && "channelId" in selection && selection.channelId === c.id) setSelection(null);
        // Refresh archived list
        loadArchivedChannels();
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? "削除に失敗しました");
      }
    } else {
      const { channelId, talk: t } = deleteTarget;
      const res = await fetch(`/api/task-channels/${channelId}/talks/${t.id}`, { method: "DELETE" });
      if (res.ok) {
        setTalksByChannel((prev) => ({
          ...prev,
          [channelId]: (prev[channelId] ?? []).filter((x) => x.id !== t.id),
        }));
        if (selection?.type === "talk" && selection.talkId === t.id) setSelection(null);
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? "削除に失敗しました");
      }
    }
    setDeleteTarget(null);
  };

  const restoreChannel = async (c: Channel) => {
    const res = await fetch(`/api/task-channels/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    if (res.ok) {
      load();
    } else {
      const d = await res.json().catch(() => null);
      alert(d?.error ?? "復元に失敗しました");
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/task-channels")
      .then((r) => r.json())
      .then((d) => { setChannels(d?.channels ?? []); setArchivedChannels(d?.archivedChannels ?? []); })
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, []);

  const loadArchivedChannels = useCallback(() => {
    fetch("/api/task-channels")
      .then((r) => r.json())
      .then((d) => setArchivedChannels(d?.archivedChannels ?? []))
      .catch(() => {});
  }, []);

  const loadDms = useCallback(() => {
    setDmLoading(true);
    fetch("/api/dm-channels")
      .then((r) => r.json())
      .then((d) => setDmChannels(d?.dmChannels ?? []))
      .catch(() => setDmChannels([]))
      .finally(() => setDmLoading(false));
  }, []);

  // ---- 未読管理 ----
  const selectionRef = useRef<Selection>(null);
  selectionRef.current = selection;

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/task-channels/unread");
      if (!res.ok) return;
      const d = await res.json();
      const next = {
        byTalk: (d?.byTalk ?? {}) as Record<string, number>,
        byChannel: (d?.byChannel ?? {}) as Record<string, number>,
        total: (d?.total ?? 0) as number,
      };
      // 開いているトーク/DMは自動で既読化する（閲覧中に届いた新着を未読のままにしない）
      const cur = selectionRef.current;
      const openTalkId = cur?.type === "talk" ? cur.talkId : cur?.type === "dm" ? cur.talkId : null;
      if (openTalkId && next.byTalk[openTalkId] > 0) {
        fetch("/api/task-channels/unread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talkId: openTalkId }),
        }).catch(() => {});
        delete next.byTalk[openTalkId];
        next.total = Object.values(next.byTalk).reduce((a, b) => a + b, 0);
        const openChannelId = cur?.type === "talk" ? cur.channelId : cur?.type === "dm" ? cur.dmChannelId : "";
        if (openChannelId && next.byChannel[openChannelId]) {
          const rest = (next.byChannel[openChannelId] ?? 0) - (d?.byTalk?.[openTalkId] ?? 0);
          if (rest > 0) next.byChannel[openChannelId] = rest;
          else delete next.byChannel[openChannelId];
        }
      }
      setUnread(next);
    } catch {
      /* ignore */
    }
  }, []);

  const markTalkReadLocal = useCallback((talkId: string, channelId: string) => {
    fetch("/api/task-channels/unread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ talkId }),
    }).catch(() => {});
    setUnread((prev) => {
      if (!prev.byTalk[talkId]) return prev;
      const byTalk = { ...prev.byTalk };
      const removed = byTalk[talkId] ?? 0;
      delete byTalk[talkId];
      const byChannel = { ...prev.byChannel };
      if (byChannel[channelId]) {
        const rest = byChannel[channelId] - removed;
        if (rest > 0) byChannel[channelId] = rest;
        else delete byChannel[channelId];
      }
      return { byTalk, byChannel, total: Math.max(0, prev.total - removed) };
    });
  }, []);

  useEffect(() => {
    loadUnread();
    const timer = setInterval(loadUnread, 30000);
    const onFocus = () => loadUnread();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadUnread]);

  useEffect(() => {
    setSession(getClientSession());
    setChannelOrder(getOrder("channels"));
    setHiddenChannels(getHiddenIds("channels"));
    load();
    loadDms();
  }, [load, loadDms]);

  // ---- 通知からのダイレクトリンク（?channel=&talk=&msg= / ?dm=&talk=&msg=） ----
  // 通知を押して遷移してきた場合、対象のトーク/DMを自動で開き、トリガーメッセージまでスクロールする
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const talkId = params.get("talk");
    const msgId = params.get("msg");
    if (!talkId) return;
    if (params.get("dm")) {
      const dmChannelId = params.get("dm");
      const dm = dmChannels.find((d) => d.id === dmChannelId || d.talkId === talkId);
      if (!dm) return;
      deepLinkHandled.current = true;
      selectDm(dm);
    } else {
      const channelId = params.get("channel");
      if (!channelId || !channels.some((c) => c.id === channelId)) return;
      deepLinkHandled.current = true;
      setExpanded((prev) => new Set(prev).add(channelId));
      loadChannel(channelId);
      selectTalk(channelId, talkId);
    }
    if (msgId) setPendingHighlight(msgId);
    // URLパラメータを除去（再読み込みで再度スクロールしないように）
    window.history.replaceState(null, "", "/tasks/channels");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, dmChannels]);

  const loadChannel = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/task-channels/${id}`);
      if (!res.ok) return;
      const d = await res.json();
      setTalksByChannel((prev) => ({ ...prev, [id]: d.talks ?? [] }));
      if (d.channel) setChannels((prev) => prev.map((c) => (c.id === id ? d.channel : c)));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!talksByChannel[id]) loadChannel(id);
      }
      return next;
    });
  };

  const selectChannel = (id: string) => {
    setSelection({ type: "channel", channelId: id });
    if (!talksByChannel[id]) loadChannel(id);
    setExpanded((prev) => new Set(prev).add(id));
  };
  const selectTalk = (channelId: string, talkId: string) => {
    setSelection({ type: "talk", channelId, talkId });
    markTalkReadLocal(talkId, channelId);
  };
  const selectDm = (dm: DmChannel) => {
    if (!dm.talkId) return;
    setSelection({ type: "dm", dmChannelId: dm.id, talkId: dm.talkId, peer: dm.peer });
    markTalkReadLocal(dm.talkId, dm.id);
    setSidebarTab("dm");
  };

  // ---- 並べ替え・表示制御 ----
  const orderedChannels = applyManualOrder(channels, channelOrder);
  const q = search.trim().toLowerCase();
  const filteredChannels = orderedChannels.filter((c) => {
    if (!showHidden && hiddenChannels.includes(c.id)) return false;
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    return (talksByChannel[c.id] ?? []).some((t) => t.name.toLowerCase().includes(q));
  });
  const hiddenCount = channels.filter((c) => hiddenChannels.includes(c.id)).length;

  const dropChannel = (targetId: string) => {
    if (!dragChannel || dragChannel === targetId) {
      setDragChannel(null);
      setDragOverChannel(null);
      return;
    }
    const moved = moveInOrder(orderedChannels.map((c) => c.id), dragChannel, targetId);
    setChannelOrder(moved);
    setOrder("channels", moved);
    setDragChannel(null);
    setDragOverChannel(null);
  };

  const orderedTalks = (channelId: string) => {
    const talks = talksByChannel[channelId] ?? [];
    return applyManualOrder(talks, getOrder(`talks_${channelId}`));
  };
  const dropTalk = (channelId: string, targetTalkId: string) => {
    if (!dragTalk || dragTalk.channelId !== channelId || dragTalk.talkId === targetTalkId) {
      setDragTalk(null);
      setDragOverTalk(null);
      return;
    }
    const ids = orderedTalks(channelId).map((t) => t.id);
    const moved = moveInOrder(ids, dragTalk.talkId, targetTalkId);
    setOrder(`talks_${channelId}`, moved);
    setTalksByChannel((prev) => ({ ...prev })); // trigger re-render
    setDragTalk(null);
    setDragOverTalk(null);
  };

  const toggleHideChannel = (id: string) => setHiddenChannels(toggleHiddenId("channels", id));

  const selectedChannel = selection && "channelId" in selection ? channels.find((c) => c.id === selection.channelId) ?? null : null;
  const selectedTalk =
    selection?.type === "talk"
      ? (talksByChannel[selection.channelId] ?? []).find((t) => t.id === selection.talkId) ?? null
      : null;

  return (
    <div className="h-screen flex flex-col bg-white text-gray-800">
      {/* 上部バー */}
      <header className="h-12 flex items-center gap-3 px-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
          <span className="text-white text-[11px] font-bold">K</span>
        </div>
        <span className="text-sm font-bold text-gray-800">チャット</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/features" className="text-gray-500 hover:text-gray-800 text-xs transition">機能一覧</Link>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 左サイドバー */}
        <aside className="w-80 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col min-h-0">
          <div className="px-3 pt-3 pb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">チャット</h2>
            {isAdmin && (
              <button
                onClick={() => setShowCreateChannel(true)}
                title="新規チャンネル"
                className="w-7 h-7 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-lg leading-none flex items-center justify-center transition"
              >
                +
              </button>
            )}
          </div>

          {/* 検索 */}
          <div className="px-3 pb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="チャンネル・トークルームを検索"
              className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* タブ切替: チャネル / ダイレクト */}
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <button
              onClick={() => setSidebarTab("channels")}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition flex items-center gap-1 ${
                sidebarTab === "channels" ? "bg-emerald-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              チャネル
              <UnreadBadge count={Object.entries(unread.byChannel).filter(([id]) => !dmChannels.some((dm) => dm.id === id)).reduce((a, [, n]) => a + n, 0)} />
            </button>
            <button
              onClick={() => { setSidebarTab("dm"); if (dmChannels.length === 0 && !dmLoading) loadDms(); }}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition flex items-center gap-1 ${
                sidebarTab === "dm" ? "bg-indigo-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              ダイレクト
              <UnreadBadge count={dmChannels.reduce((a, dm) => a + (dm.talkId ? unread.byTalk[dm.talkId] ?? 0 : 0), 0)} />
            </button>
            {sidebarTab === "channels" && hiddenCount > 0 && (
              <button
                onClick={() => setShowHidden((v) => !v)}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
              >
                {showHidden ? "非表示を隠す" : `非表示 (${hiddenCount})`}
              </button>
            )}
          </div>

          {sidebarTab === "channels" && (
          <div className="px-3 pb-1 flex items-center gap-1.5 text-gray-500">
            <span className="text-[11px] font-bold uppercase tracking-wide">Teams とチャネル</span>
          </div>
          )}

          {sidebarTab === "dm" && (
          <div className="px-3 pb-1 flex items-center justify-between text-gray-500">
            <span className="text-[11px] font-bold uppercase tracking-wide">ダイレクトチャット</span>
            <button
              onClick={() => setShowNewDm(true)}
              title="新規DM"
              className="w-6 h-6 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm leading-none flex items-center justify-center transition"
            >
              +
            </button>
          </div>
          )}

          {/* チャンネルツリー / DMリスト */}
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {sidebarTab === "dm" ? (
              /* ---- DM一覧 ---- */
              dmLoading ? (
                <p className="text-xs text-gray-500 py-6 text-center">読み込み中...</p>
              ) : dmChannels.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-gray-500 mb-2">ダイレクトチャットはまだありません</p>
                  <button
                    onClick={() => setShowNewDm(true)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-500"
                  >
                    + 新しいDMを始める
                  </button>
                </div>
              ) : (
                dmChannels.map((dm) => {
                  const active = selection?.type === "dm" && (selection as { dmChannelId: string }).dmChannelId === dm.id;
                  return (
                    <button
                      key={dm.id}
                      onClick={() => selectDm(dm)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 cursor-pointer transition mb-0.5 ${
                        active ? "bg-indigo-100" : "hover:bg-gray-100"
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-full ${colorFor(dm.peer.id)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                        {dm.peer.name.charAt(0)}
                      </span>
                      <div className="flex-1 min-w-0 text-left">
                        <p className={`text-sm truncate ${active ? "font-semibold text-gray-800" : "text-gray-700"}`}>{dm.peer.name}</p>
                        {dm.lastMessage && (
                          <p className="text-[11px] text-gray-500 truncate">{dm.lastMessage}</p>
                        )}
                      </div>
                      <UnreadBadge count={dm.talkId ? unread.byTalk[dm.talkId] ?? 0 : 0} />
                      {dm.lastMessageAt && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{fmt(dm.lastMessageAt).split(" ")[1]}</span>
                      )}
                    </button>
                  );
                })
              )
            ) : (
              /* ---- チャンネルツリー ---- */
              loading ? (
              <p className="text-xs text-gray-500 py-6 text-center">読み込み中...</p>
            ) : filteredChannels.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">
                {channels.length === 0 ? "チャンネルがありません" : "該当するチャンネルがありません"}
              </p>
            ) : (
              filteredChannels.map((c) => {
                const isOpen = expanded.has(c.id) || (!!q);
                const talks = orderedTalks(c.id);
                const isHidden = hiddenChannels.includes(c.id);
                const active = selection?.type === "channel" && selection.channelId === c.id;
                return (
                  <div key={c.id} className={isHidden ? "opacity-50" : ""}>
                    <div
                      draggable
                      onDragStart={() => setDragChannel(c.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragChannel && dragOverChannel !== c.id) setDragOverChannel(c.id);
                      }}
                      onDragLeave={() => setDragOverChannel((cur) => (cur === c.id ? null : cur))}
                      onDrop={() => dropChannel(c.id)}
                      onDragEnd={() => {
                        setDragChannel(null);
                        setDragOverChannel(null);
                      }}
                      className={`group flex items-center gap-1 rounded-lg px-1.5 py-1.5 cursor-pointer transition ${
                        active ? "bg-gray-100" : "hover:bg-gray-100"
                      } ${dragOverChannel === c.id && dragChannel !== c.id ? "ring-1 ring-emerald-500" : ""} ${
                        dragChannel === c.id ? "opacity-40" : ""
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(c.id);
                        }}
                        className="w-4 text-gray-500 hover:text-gray-700 text-[10px] flex-shrink-0"
                        title={isOpen ? "折りたたむ" : "展開"}
                      >
                        {isOpen ? "▾" : "▸"}
                      </button>
                      <span className={`w-6 h-6 rounded ${colorFor(c.id)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {c.name.charAt(0)}
                      </span>
                      <button
                          onClick={() => selectChannel(c.id)}
                          onDoubleClick={(e) => {
                            if (!isAdmin) return;
                            e.stopPropagation();
                            startRenameChannel(c);
                          }}
                          className="flex-1 min-w-0 text-left"
                        >
                          <span className={`text-sm truncate block ${active ? "text-gray-800 font-semibold" : "text-gray-700"}`}>{c.name}</span>
                        </button>
                      <UnreadBadge count={unread.byChannel[c.id] ?? 0} />
                      <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition">
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startRenameChannel(c);
                            }}
                            title="名前を変更"
                            className="text-gray-500 hover:text-emerald-400 text-xs px-1"
                          >
                            ✎
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChannelAction(c);
                            }}
                            title="チャンネルを削除"
                            className="text-gray-500 hover:text-rose-500 text-xs px-1"
                          >
                            ✕
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleHideChannel(c.id);
                          }}
                          title={isHidden ? "表示する" : "非表示にする"}
                          className="text-gray-500 hover:text-gray-700 text-xs px-1"
                        >
                          {isHidden ? "◎" : "⦸"}
                        </button>
                        <span className="text-gray-400 cursor-grab active:cursor-grabbing text-xs px-0.5" title="ドラッグで並べ替え">⠿</span>
                      </span>
                    </div>

                    {/* トークルーム */}
                    {isOpen && (
                      <div className="ml-6 mt-0.5 mb-1 space-y-0.5">
                        {(talksByChannel[c.id] === undefined) ? (
                          <p className="text-[11px] text-gray-400 px-2 py-1">読み込み中...</p>
                        ) : talks.length === 0 ? (
                          <p className="text-[11px] text-gray-400 px-2 py-1">トークルームなし</p>
                        ) : (
                          talks
                            .filter((t) => !q || t.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
                            .map((t) => {
                              const tActive = selection?.type === "talk" && selection.talkId === t.id;
                              const canRenameTalk = isAdmin || c.members.some((m) => m.id === meId);
                              return (
                                <div
                                  key={t.id}
                                  draggable
                                  onDragStart={() => setDragTalk({ channelId: c.id, talkId: t.id })}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    if (dragTalk?.channelId === c.id && dragOverTalk !== t.id) setDragOverTalk(t.id);
                                  }}
                                  onDragLeave={() => setDragOverTalk((cur) => (cur === t.id ? null : cur))}
                                  onDrop={() => dropTalk(c.id, t.id)}
                                  onDragEnd={() => {
                                    setDragTalk(null);
                                    setDragOverTalk(null);
                                  }}
                                  onClick={() => selectTalk(c.id, t.id)}
                                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer transition group/talk ${
                                    tActive ? "bg-emerald-600/20 text-emerald-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                  } ${dragOverTalk === t.id && dragTalk?.talkId !== t.id ? "ring-1 ring-emerald-500" : ""} ${
                                    dragTalk?.talkId === t.id ? "opacity-40" : ""
                                  }`}
                                >
                                  <span className="text-gray-500 text-xs flex-shrink-0">#</span>
                                  <span
                                      className="text-[13px] truncate flex-1"
                                      onDoubleClick={(e) => {
                                        if (!canRenameTalk) return;
                                        e.stopPropagation();
                                        startRenameTalk(t);
                                      }}
                                    >
                                      {t.name}
                                    </span>
                                  <UnreadBadge count={unread.byTalk[t.id] ?? 0} />
                                  {canRenameTalk && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startRenameTalk(t);
                                      }}
                                      title="名前を変更"
                                      className="opacity-0 group-hover/talk:opacity-100 text-gray-500 hover:text-emerald-400 text-[11px] transition px-0.5"
                                    >
                                      ✎
                                    </button>
                                  )}
                                  {canRenameTalk && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteTalkAction(c.id, t);
                                      }}
                                      title="トークルームを削除"
                                      className="opacity-0 group-hover/talk:opacity-100 text-gray-500 hover:text-rose-500 text-[11px] transition px-0.5"
                                    >
                                      ✕
                                    </button>
                                  )}
                                  <span className="opacity-0 group-hover/talk:opacity-100 text-gray-400 cursor-grab active:cursor-grabbing text-[11px] transition" title="ドラッグで並べ替え">⠿</span>
                                </div>
                              );
                            })
                        )}
                        <TalkCreateInline
                          channel={c}
                          canCreate={isAdmin || c.members.some((m) => m.id === meId)}
                          onClick={() => setTalkModalChannel(c)}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )
            )}
            {sidebarTab === "channels" && isAdmin && archivedChannels.length > 0 && (
              <div className="mt-3 px-1">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-1 mb-1">アーカイブ済みチャンネル</div>
                {archivedChannels.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 opacity-60 hover:opacity-100 transition">
                    <span className={`w-6 h-6 rounded ${colorFor(c.id)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 opacity-50`}>
                      {c.name.charAt(0)}
                    </span>
                    <span className="text-sm text-gray-500 truncate flex-1">{c.name}</span>
                    <button
                      onClick={() => restoreChannel(c)}
                      className="text-[11px] font-bold text-emerald-600 hover:text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-200 hover:bg-emerald-50 transition"
                    >
                      復元
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-gray-200">
            <span className="text-[11px] text-gray-500">ドラッグで並べ替え・チャンネルは管理者が作成</span>
          </div>
        </aside>

        {/* 右メインペイン */}
        <main className="flex-1 min-w-0 bg-white flex flex-col min-h-0">
          {!selection ? (
            <EmptyState isAdmin={isAdmin} onCreate={() => setShowCreateChannel(true)} />
          ) : selection.type === "talk" && selectedTalk && selectedChannel ? (
            <TalkView
              key={selectedTalk.id}
              channel={selectedChannel}
              talk={selectedTalk}
              canManage={isAdmin || selectedChannel.members.some((m) => m.id === meId)}
              meId={meId}
              highlightMessageId={pendingHighlight}
              clearHighlight={() => setPendingHighlight(null)}
              onTalkUpdated={(t) =>
                setTalksByChannel((prev) => ({
                  ...prev,
                  [t.channelId]: (prev[t.channelId] ?? []).map((x) => (x.id === t.id ? t : x)),
                }))
              }
            />
          ) : selection.type === "channel" && selectedChannel ? (
            <ChannelView
              key={selectedChannel.id}
              channel={selectedChannel}
              talks={talksByChannel[selectedChannel.id] ?? []}
              isAdmin={isAdmin}
              canCreateTalk={isAdmin || selectedChannel.members.some((m) => m.id === meId)}
              onOpenTalk={(talkId) => selectTalk(selectedChannel.id, talkId)}
              onCreateTalk={() => setTalkModalChannel(selectedChannel)}
              onChannelUpdated={(c) => setChannels((prev) => prev.map((x) => (x.id === c.id ? c : x)))}
            />
          ) : selection.type === "dm" ? (
            <DmView
              key={selection.dmChannelId}
              dmChannelId={selection.dmChannelId}
              peer={selection.peer}
              meId={meId}
              meName={session?.name ?? ""}
              highlightMessageId={pendingHighlight}
              clearHighlight={() => setPendingHighlight(null)}
              onMessageSent={() => loadDms()}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">読み込み中...</div>
          )}
        </main>
      </div>

      {showNewDm && (
        <NewDmModal
          meId={meId}
          onClose={() => setShowNewDm(false)}
          onCreated={(dm) => {
            setShowNewDm(false);
            setDmChannels((prev) => {
              if (prev.some((d) => d.id === dm.id)) return prev;
              return [dm, ...prev];
            });
            selectDm(dm);
          }}
        />
      )}

      {showCreateChannel && (
        <CreateChannelModal
          session={session}
          onClose={() => setShowCreateChannel(false)}
          onCreated={(c) => {
            setShowCreateChannel(false);
            setChannels((prev) => [...prev, c]);
            selectChannel(c.id);
          }}
        />
      )}

      {talkModalChannel && (
        <CreateTalkModal
          channel={talkModalChannel}
          meId={meId}
          onClose={() => setTalkModalChannel(null)}
          onCreated={(talk) => {
            setTalksByChannel((prev) => ({
              ...prev,
              [talk.channelId]: [talk, ...(prev[talk.channelId] ?? [])],
            }));
            setExpanded((prev) => new Set(prev).add(talk.channelId));
            setTalkModalChannel(null);
            selectTalk(talk.channelId, talk.id);
          }}
        />
      )}

      {renameTarget && (
        <RenameModal
          label={renameTarget.type === "channel" ? "チャンネル名" : "トークルーム名"}
          currentName={renameTarget.currentName}
          onClose={() => setRenameTarget(null)}
          onSubmit={handleRenameSubmit}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          target={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function TalkCreateInline({ channel, canCreate, onClick }: { channel: Channel; canCreate: boolean; onClick: () => void }) {
  if (!canCreate) return null;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-gray-500 hover:text-emerald-400 hover:bg-gray-100 transition"
    >
      <span className="text-sm">+</span> トークルームを追加
    </button>
  );
}

function RenameModal({
  label,
  currentName,
  onClose,
  onSubmit,
}: {
  label: string;
  currentName: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // auto-focus and select all on open
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const submit = async () => {
    const name = value.trim();
    if (!name) { setError("名前を入力してください"); return; }
    if (name === currentName) { onClose(); return; }
    setSaving(true);
    setError("");
    try {
      await onSubmit(name);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "名称変更に失敗しました");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-base">{label}を編集</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
            <input
              ref={inputRef}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
                if (e.key === "Escape") onClose();
              }}
              disabled={saving}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ isAdmin, onCreate }: { isAdmin: boolean; onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl">💬</div>
      <p className="text-lg font-bold text-gray-800">チャンネルまたはトークルームを選択</p>
      <p className="text-sm text-gray-500 max-w-sm">左のリストからチャンネルを開き、トークルームを選ぶと内容が表示されます。</p>
      {isAdmin && (
        <button onClick={onCreate} className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-5 py-2 rounded-xl transition">
          + 新規チャンネルを作成
        </button>
      )}
    </div>
  );
}

/* ------------ トークルーム投稿ビュー（Teams風） ------------ */
function TalkView({
  channel,
  talk,
  canManage,
  meId,
  highlightMessageId,
  clearHighlight,
  onTalkUpdated,
}: {
  channel: Channel;
  talk: Talk;
  canManage: boolean;
  meId: string;
  /** 通知から遷移した場合のスクロール対象メッセージID */
  highlightMessageId?: string | null;
  clearHighlight?: () => void;
  onTalkUpdated: (t: Talk) => void;
}) {
  const [tab, setTab] = useState<"chat" | "tasks" | "members">("chat");
  const [showAdd, setShowAdd] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskPrefill, setTaskPrefill] = useState<{ title: string; description: string }>({ title: "", description: "" });
  const [tasks, setTasks] = useState<FullTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(talk.name);
  const [savingName, setSavingName] = useState(false);
  // チャット
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(true);
  const [composer, setComposer] = useState("");
  const [subject, setSubject] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // 添付ファイル（data URL）
  const [attachments, setAttachments] = useState<TalkAttachmentT[]>([]);
  const [attachError, setAttachError] = useState("");
  // 引用（現在 or 他トークルームのメッセージ）
  const [quoteDraft, setQuoteDraft] = useState<TalkQuote | null>(null);
  const [showQuotePicker, setShowQuotePicker] = useState(false);
  // ファイル検索モーダル
  const [showFileSearch, setShowFileSearch] = useState(false);
  // スレッド返信
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<TalkAttachmentT[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const mainFileInputRef = useRef<HTMLInputElement | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement | null>(null);

  const MAX_FILE_BYTES = 50 * 1024 * 1024; // 1ファイル最大50MB
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // 画像・ファイルを添付に追加（画像は縮小、その他はそのまま data URL 化）
  const addFiles = async (files: File[], target: "main" | "reply") => {
    setAttachError("");
    if (files.length === 0) return;
    const setter = target === "main" ? setAttachments : setReplyAttachments;
    const results: TalkAttachmentT[] = [];
    const errors: string[] = [];
    for (const f of files) {
      try {
        if (f.type.startsWith("image/")) {
          const dataUrl = await resizeImageToDataUrl(f);
          results.push({ name: f.name || "screenshot.png", dataUrl, type: f.type || "image/png", size: f.size });
        } else {
          if (f.size > MAX_FILE_BYTES) {
            errors.push(`${f.name || "ファイル"}は50MBを超えています`);
            continue;
          }
          const dataUrl = await fileToDataUrl(f);
          results.push({ name: f.name || "file", dataUrl, type: f.type || "application/octet-stream", size: f.size });
        }
      } catch {
        errors.push(`${f.name || "ファイル"}の処理に失敗しました`);
      }
    }
    if (results.length > 0) {
      setter((prev) => [...prev, ...results].slice(0, 6));
      if (target === "main") setComposerOpen(true);
    }
    if (errors.length > 0) setAttachError(errors.join(" / "));
  };

  // ドラッグ&ドロップ
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer?.types?.includes("Files")) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) addFiles(files, "main");
  };

  // 貼り付け（Ctrl+V）: 画像のみ
  const addImageFiles = (files: File[], target: "main" | "reply") =>
    addFiles(files.filter((f) => f.type.startsWith("image/")), target);

  useEffect(() => {
    setTasksLoading(true);
    apiListTasks({ talkId: talk.id })
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
  }, [talk.id]);

  useEffect(() => {
    setMsgLoading(true);
    fetch(`/api/task-channels/${channel.id}/talks/${talk.id}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d?.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false));
  }, [channel.id, talk.id]);

  // 通知から遷移した場合: トリガーメッセージまでスクロールしてハイライト
  useEffect(() => {
    if (!highlightMessageId || msgLoading) return;
    const el = document.querySelector(`[data-message-id="${highlightMessageId}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("kt-msg-highlight");
      window.setTimeout(() => el.classList.remove("kt-msg-highlight"), 4000);
    }
    clearHighlight?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMessageId, msgLoading, messages]);

  const sendMessage = async () => {
    const text = composer.trim();
    if ((!text && attachments.length === 0 && !quoteDraft) || sending) return;
    setSending(true);
    try {
      // 添付ファイルを事前に Supabase Storage にアップロード
      const uploadedAttachments = attachments.length > 0
        ? await uploadAttachmentsToStorage(attachments, channel.id, talk.id)
        : [];
      const mentions = extractMentions(text, talk.members);
      const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          subject: subject.trim() || undefined,
          mentions,
          attachments: uploadedAttachments,
          quote: quoteDraft
            ? { messageId: quoteDraft.messageId, talkId: quoteDraft.talkId, channelId: quoteDraft.channelId }
            : undefined,
        }),
      });
      const d = await res.json();
      if (res.ok && d.message) {
        setMessages((prev) => [...prev, d.message]);
        setComposer("");
        setSubject("");
        setAttachments([]);
        setQuoteDraft(null);
        setComposerOpen(false);
      } else {
        alert(d?.error ?? "送信に失敗しました");
      }
    } finally {
      setSending(false);
    }
  };

  // メッセージを引用してコンポーザを開く（現在のトークルーム）
  const quoteMessage = (m: TalkMessage) => {
    setQuoteDraft({
      messageId: m.id,
      talkId: talk.id,
      channelId: channel.id,
      talkName: talk.name,
      authorName: m.authorName,
      text: (m.text || (m.attachments?.length ? "[画像]" : "")).slice(0, 500),
      createdAt: m.createdAt,
    });
    setComposerOpen(true);
  };

  const sendReply = async (parentId: string) => {
    const text = replyText.trim();
    if ((!text && replyAttachments.length === 0) || replySending) return;
    setReplySending(true);
    try {
      const uploadedAttachments = replyAttachments.length > 0
        ? await uploadAttachmentsToStorage(replyAttachments, channel.id, talk.id)
        : [];
      const mentions = extractMentions(text, talk.members);
      const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, parentId, mentions, attachments: uploadedAttachments }),
      });
      const d = await res.json();
      if (res.ok && d.message) {
        setMessages((prev) => [...prev, d.message]);
        setReplyText("");
        setReplyAttachments([]);
        setReplyTo(null);
      } else {
        alert(d?.error ?? "返信に失敗しました");
      }
    } finally {
      setReplySending(false);
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("このメッセージを削除しますか？")) return;
    const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}/messages/${id}`, { method: "DELETE" });
    if (res.ok) setMessages((prev) => prev.filter((m) => m.id !== id));
    else alert("削除に失敗しました");
  };

  const startEdit = (m: TalkMessage) => { setEditingId(m.id); setEditingText(m.text); };
  const cancelEdit = () => { setEditingId(null); setEditingText(""); };
  const saveEdit = async () => {
    if (!editingId || editSaving) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: editingId, text: editingText }),
      });
      if (res.ok) {
        const d = await res.json();
        setMessages((prev) => prev.map((m) => m.id === editingId ? { ...m, ...d.message } : m));
        cancelEdit();
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? "編集に失敗しました");
      }
    } finally {
      setEditSaving(false);
    }
  };

  const deleteAttachment = async (messageId: string, attachIndex: number) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.attachments) return;
    const newAttachments = msg.attachments.filter((_, i) => i !== attachIndex);
    const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachments: newAttachments }),
    });
    if (res.ok) {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, attachments: newAttachments } : m));
    } else {
      alert("添付ファイルの削除に失敗しました");
    }
  };

  const toggleReaction = async (id: string, emoji: string) => {
    const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactionMessageId: id, emoji }),
    });
    const d = await res.json();
    if (res.ok && d.messages) setMessages(d.messages);
  };

  const openTaskFromMessage = (m: TalkMessage) => {
    setTaskPrefill({ title: m.text.slice(0, 60), description: `依頼元メッセージ（${m.authorName}）:\n${m.text}` });
    setShowCreateTask(true);
  };
  const openTaskBlank = () => {
    setTaskPrefill({ title: "", description: "" });
    setShowCreateTask(true);
  };

  useEffect(() => {
    setNameInput(talk.name);
    setEditingName(false);
  }, [talk.id, talk.name]);

  const saveName = async () => {
    const name = nameInput.trim();
    if (!name || name === talk.name) {
      setEditingName(false);
      setNameInput(talk.name);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (res.ok) {
        onTalkUpdated(d.talk);
        setEditingName(false);
      } else alert(d?.error ?? "名称変更に失敗しました");
    } finally {
      setSavingName(false);
    }
  };

  const removeMember = async (id: string) => {
    if (!confirm("このメンバーをトークルームから外しますか？")) return;
    const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeMemberId: id }),
    });
    const d = await res.json();
    if (res.ok) onTalkUpdated(d.talk);
    else alert(d?.error ?? "削除に失敗しました");
  };

  // トークルームの参加メンバーを担当候補にする（自分も含める）
  const taskCandidates = talk.members.map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ヘッダー */}
      <div className="flex-shrink-0 border-b border-gray-200 px-5 pt-3">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded ${colorFor(channel.id)} flex items-center justify-center text-white text-sm font-bold`}>
            {channel.name.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNameInput(talk.name);
                    }
                  }}
                  className="bg-gray-100 border border-emerald-500 rounded px-2 py-1 text-sm text-gray-800 w-56 focus:outline-none"
                />
                <button onClick={saveName} disabled={savingName} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 px-1 disabled:opacity-50">
                  {savingName ? "保存中" : "保存"}
                </button>
                <button onClick={() => { setEditingName(false); setNameInput(talk.name); }} className="text-xs text-gray-500 hover:text-gray-600 px-1">
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-bold text-gray-800 truncate">{talk.name}</h1>
                {canManage && (
                  <button
                    onClick={() => setEditingName(true)}
                    title="トークルーム名を変更"
                    className="text-gray-500 hover:text-emerald-400 transition text-xs flex-shrink-0"
                  >
                    ✎
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-500 truncate">{channel.name} ・ 招待 {talk.members.length}名 ・ 依頼 {tasks.length}件</p>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-2">
          {(["chat", "tasks", "members"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
                tab === t ? "border-emerald-500 text-gray-800" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "chat" ? "チャット" : t === "tasks" ? `依頼（タスク）${tasks.length > 0 ? ` ${tasks.length}` : ""}` : `メンバー ${talk.members.length}`}
            </button>
          ))}
          <button
            onClick={() => setShowFileSearch(true)}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-emerald-300 border border-gray-300 hover:border-emerald-500 rounded-lg transition"
            title="このトークルームのファイルを検索"
          >
            📎 ファイル検索
          </button>
        </div>
      </div>

      {tab === "chat" ? (
        <>
          {/* チャット（会話） */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="max-w-2xl mx-auto space-y-4">
              {msgLoading ? (
                <p className="text-sm text-gray-500 py-10 text-center">読み込み中...</p>
              ) : messages.filter((m) => !m.parentId).length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 mx-auto flex items-center justify-center text-2xl mb-3">💬</div>
                  <p className="text-base font-bold text-gray-800">「{talk.name}」の会話をはじめましょう</p>
                  <p className="text-sm text-gray-500 mt-1">下の「新しい投稿」から件名と本文で投稿できます。各投稿には「スレッドで返信」で会話を続けられ、メッセージから「依頼（タスク）にする」で起票できます。</p>
                </div>
              ) : (
                (() => {
                  const posts = messages.filter((m) => !m.parentId);
                  const repliesOf = (pid: string) =>
                    messages.filter((m) => m.parentId === pid).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
                  const renderRow = (m: TalkMessage, isReply: boolean) => {
                    const mine = m.authorId === meId;
                    if (m.kind === "system") {
                      return (
                        <div key={m.id} className="flex justify-center py-1">
                          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5 text-[12px] text-emerald-300 flex items-center gap-2">
                            <span>📋 {m.text}</span>
                            {m.taskId && (
                              <Link href={`/tasks/${m.taskId}`} className="underline font-bold hover:text-emerald-200">
                                依頼を開く
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    }
                    const reactions = m.reactions ?? [];
                    return (
                      <div key={m.id} data-message-id={m.id} className="flex gap-3 group">
                        <span className={`${isReply ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm"} rounded-full ${colorFor(m.authorId)} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                          {m.authorName.charAt(0)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`${isReply ? "text-[13px]" : "text-sm"} font-bold text-gray-800`}>{m.authorName}</span>
                            <span className="text-[11px] text-gray-500">{fmt(m.createdAt)}</span>
                            {m.editedAt && <span className="text-[10px] text-gray-400" title={`編集: ${fmt(m.editedAt)}`}>✏️ 編集済み {fmt(m.editedAt)}</span>}
                          </div>
                          {!isReply && m.subject && <p className="text-[15px] font-bold text-gray-800 mt-0.5">{m.subject}</p>}
                          {renderQuote(m.quote, talk.id)}
                          <AttachmentViewer attachments={m.attachments} messageId={m.id} isMine={mine} onDeleteAttachment={deleteAttachment} />
                          {editingId === m.id ? (
                            <div className="mt-0.5">
                              <textarea
                                autoFocus
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") cancelEdit();
                                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveEdit();
                                }}
                                className="w-full rounded-lg border border-emerald-400 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                                rows={3}
                              />
                              <div className="mt-1 flex items-center gap-2">
                                <button onClick={saveEdit} disabled={editSaving} className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1 rounded-lg transition disabled:opacity-50">
                                  {editSaving ? "保存中..." : "保存"}
                                </button>
                                <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">キャンセル</button>
                                <span className="text-[10px] text-gray-400 ml-auto">⌘+Enter で保存 / Esc でキャンセル</span>
                              </div>
                            </div>
                          ) : m.text ? (
                            <div className="mt-0.5 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 break-words">{renderRichMessage(m.text, talk.members, meId)}</div>
                          ) : null}
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {reactions.map((r) => (
                              <button
                                key={r.emoji}
                                onClick={() => toggleReaction(m.id, r.emoji)}
                                className={`text-[12px] px-2 py-0.5 rounded-full border transition ${
                                  r.userIds.includes(meId)
                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200"
                                    : "bg-gray-100 border-gray-300 text-gray-600 hover:border-gray-400"
                                }`}
                              >
                                {r.emoji} {r.userIds.length}
                              </button>
                            ))}
                            <span className="opacity-0 group-hover:opacity-100 transition flex items-center gap-2">
                              <button onClick={() => toggleReaction(m.id, "👍")} className="text-[12px] text-gray-500 hover:text-emerald-400" title="いいね">👍</button>
                              {canManage && (
                                <button onClick={() => quoteMessage(m)} className="text-[11px] font-bold text-sky-400 hover:text-sky-300" title="このメッセージを引用">
                                  引用
                                </button>
                              )}
                              {canManage && (
                                <button onClick={() => openTaskFromMessage(m)} className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300">
                                  依頼（タスク）にする
                                </button>
                              )}
                              {mine && m.text && (
                                <button onClick={() => startEdit(m)} className="text-[11px] text-gray-500 hover:text-sky-400">編集</button>
                              )}
                              {(mine || canManage) && (
                                <button onClick={() => deleteMessage(m.id)} className="text-[11px] text-gray-500 hover:text-rose-400">削除</button>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  };
                  return posts.map((p) => {
                    const replies = repliesOf(p.id);
                    return (
                      <div key={p.id} className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                        <div className="p-4">{renderRow(p, false)}</div>
                        {replies.length > 0 && (
                          <div className="border-t border-gray-200 px-4 py-3 space-y-3 bg-gray-50">
                            {replies.map((r) => renderRow(r, true))}
                          </div>
                        )}
                        {p.kind !== "system" && (
                          <div className="border-t border-gray-200 px-4 py-2 bg-gray-100">
                            {replyTo === p.id ? (
                              <div className="space-y-2">
                                {replyAttachments.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {replyAttachments.map((a, i) => (
                                      <div key={i} className="relative">
                                        {isImageAttachment(a) ? (
                                          /* eslint-disable-next-line @next/next/no-img-element */
                                          <img src={a.dataUrl} alt={a.name || "添付"} className="h-16 w-16 object-cover rounded-lg border border-gray-300" />
                                        ) : (
                                          <div className="flex items-center gap-2 h-16 w-40 rounded-lg border border-gray-300 bg-gray-100 px-2">
                                            <span className="text-xl flex-shrink-0">{fileIcon(a)}</span>
                                            <span className="min-w-0">
                                              <span className="block truncate text-[11px] text-gray-800">{a.name || "ファイル"}</span>
                                              <span className="block text-[10px] text-gray-500">{formatBytes(a.size)}</span>
                                            </span>
                                          </div>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => setReplyAttachments((prev) => prev.filter((_, j) => j !== i))}
                                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-600 text-xs hover:bg-rose-600 hover:text-white"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <input
                                  ref={replyFileInputRef}
                                  type="file"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files ?? []);
                                    if (files.length) addFiles(files, "reply");
                                    e.target.value = "";
                                  }}
                                />
                                <div className="rounded-lg border border-gray-300 bg-gray-50 p-2">
                                  <MentionTextarea
                                    autoFocus
                                    value={replyText}
                                    onChange={setReplyText}
                                    members={talk.members.map((mm) => ({ id: mm.id, name: mm.name }))}
                                    onSubmit={() => sendReply(p.id)}
                                    onEscape={() => { setReplyTo(null); setReplyText(""); setReplyAttachments([]); }}
                                    onImageFiles={(files) => addImageFiles(files, "reply")}
                                    showToolbar
                                    meId={meId}
                                    rows={2}
                                    placeholder="返信を入力（@でメンション・装飾ツールバー・画像はCtrl+Vで添付・⌘/Ctrl+Enterで送信）"
                                    className="w-full resize-none bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 max-h-40"
                                  />
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <button onClick={() => replyFileInputRef.current?.click()} className="text-xs font-bold text-gray-600 hover:text-emerald-300 border border-gray-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition">
                                      📎 ファイル
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => { setReplyTo(null); setReplyText(""); setReplyAttachments([]); }} className="text-xs text-gray-500 hover:text-gray-600 px-2 py-1.5">取消</button>
                                      <button onClick={() => sendReply(p.id)} disabled={replySending || (!replyText.trim() && replyAttachments.length === 0)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition disabled:opacity-50">
                                        {replySending ? "送信中" : "返信"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : canManage ? (
                              <button onClick={() => { setReplyTo(p.id); setReplyText(""); }} className="flex items-center gap-2 text-[13px] text-gray-500 hover:text-emerald-400 transition">
                                <span className="text-emerald-400">↩</span> スレッドで返信{replies.length > 0 ? `（${replies.length}）` : ""}
                              </button>
                            ) : (
                              <span className="text-[12px] text-gray-400">返信はチャンネル参加メンバーのみ</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
          {/* 新規投稿コンポーザ */}
          <div
            className={`flex-shrink-0 border-t border-gray-200 p-3 relative transition-colors ${isDragging ? "bg-emerald-50 border-emerald-400" : ""}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-emerald-50/80 border-2 border-dashed border-emerald-500 rounded-xl pointer-events-none">
                <div className="text-center">
                  <span className="text-3xl">📎</span>
                  <p className="text-sm font-bold text-emerald-700 mt-1">ファイルをドロップしてください</p>
                  <p className="text-xs text-emerald-600 mt-0.5">最大50MB / 6ファイルまで</p>
                </div>
              </div>
            )}
            <div className="max-w-2xl mx-auto">
              {canManage ? (
                composerOpen ? (
                  <div className="rounded-xl border border-gray-300 bg-white p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-7 h-7 rounded-full ${colorFor(meId)} flex items-center justify-center text-white text-xs font-bold`}>
                        {(talk.members.find((m) => m.id === meId)?.name ?? "自").charAt(0)}
                      </span>
                      <span className="text-sm font-bold text-gray-800">{talk.members.find((m) => m.id === meId)?.name ?? "自分"}</span>
                      <button onClick={() => { setComposerOpen(false); setSubject(""); setComposer(""); setAttachments([]); setAttachError(""); setQuoteDraft(null); }} className="ml-auto text-gray-500 hover:text-gray-600 text-sm">✕</button>
                    </div>
                    {quoteDraft && (
                      <div className="mb-2 flex items-start gap-2 border-l-2 border-sky-500/70 bg-gray-100 rounded-r-md px-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[11px] text-sky-300">
                            <span>❝ 引用</span>
                            <span className="font-bold text-gray-700">{quoteDraft.authorName}</span>
                            {quoteDraft.talkId !== talk.id && quoteDraft.talkName && (
                              <span className="text-gray-500">＠{quoteDraft.talkName}</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[12px] text-gray-600 whitespace-pre-wrap break-words line-clamp-3">{quoteDraft.text}</p>
                        </div>
                        <button type="button" onClick={() => setQuoteDraft(null)} className="flex-shrink-0 text-gray-500 hover:text-rose-400 text-xs">✕</button>
                      </div>
                    )}
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="件名を追加（任意）"
                      className="w-full bg-transparent border-b border-gray-300 focus:border-emerald-500 px-1 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none mb-2"
                    />
                    <MentionTextarea
                      autoFocus
                      value={composer}
                      onChange={setComposer}
                      members={talk.members.map((mm) => ({ id: mm.id, name: mm.name }))}
                      onSubmit={sendMessage}
                      onImageFiles={(files) => addImageFiles(files, "main")}
                      showToolbar
                      meId={meId}
                      rows={3}
                      placeholder="メッセージを入力（@でメンション・画像はCtrl+Vで添付・⌘/Ctrl+Enterで投稿）"
                      className="w-full resize-none bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 max-h-48"
                    />
                    {attachError && <p className="mt-1 text-xs text-rose-400">{attachError}</p>}
                    {attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {attachments.map((a, i) => (
                          <div key={i} className="relative">
                            {isImageAttachment(a) ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={a.dataUrl} alt={a.name || "添付"} className="h-20 w-20 object-cover rounded-lg border border-gray-300" />
                            ) : (
                              <div className="flex items-center gap-2 h-20 w-44 rounded-lg border border-gray-300 bg-gray-100 px-3">
                                <span className="text-2xl flex-shrink-0">{fileIcon(a)}</span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] text-gray-800">{a.name || "ファイル"}</span>
                                  <span className="block text-[11px] text-gray-500">{formatBytes(a.size)}</span>
                                </span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-600 text-xs hover:bg-rose-600 hover:text-white"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      ref={mainFileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length) addFiles(files, "main");
                        e.target.value = "";
                      }}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => mainFileInputRef.current?.click()} className="text-xs font-bold text-gray-600 hover:text-emerald-300 border border-gray-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition">
                          📎 ファイル添付
                        </button>
                        <button onClick={openTaskBlank} className="text-xs font-bold text-gray-600 hover:text-emerald-300 border border-gray-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition">
                          ＋依頼（タスク）
                        </button>
                        <button onClick={() => setShowQuotePicker(true)} className="text-xs font-bold text-gray-600 hover:text-sky-300 border border-gray-300 hover:border-sky-500 px-3 py-1.5 rounded-lg transition">
                          ❝ 他のトークから引用
                        </button>
                      </div>
                      <button onClick={sendMessage} disabled={sending || (!composer.trim() && attachments.length === 0 && !quoteDraft)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-5 py-1.5 rounded-lg transition disabled:opacity-50">
                        {sending ? "投稿中" : "投稿"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setComposerOpen(true)} className="w-full text-left rounded-xl border border-gray-300 bg-white hover:border-emerald-500 px-4 py-2.5 text-sm text-gray-500 transition flex items-center gap-2">
                    <span className="text-emerald-400">✎</span> 新しい投稿をはじめる…
                  </button>
                )
              ) : (
                <p className="text-xs text-gray-500 text-center py-2">投稿はチャンネル参加メンバーのみ可能です。</p>
              )}
            </div>
          </div>
        </>
      ) : tab === "tasks" ? (
        <>
          {/* 依頼（タスク）一覧 */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="max-w-2xl mx-auto space-y-2">
              {tasksLoading ? (
                <p className="text-sm text-gray-500 py-10 text-center">読み込み中...</p>
              ) : tasks.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 mx-auto flex items-center justify-center text-2xl mb-3">#</div>
                  <p className="text-base font-bold text-gray-800">「{talk.name}」の依頼はまだありません</p>
                  <p className="text-sm text-gray-500 mt-1">このトークルームで発生した依頼をタスクとして登録し、担当者に追いかけ（リマインド）を発生させましょう。</p>
                  {canManage && (
                    <button onClick={openTaskBlank} className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-5 py-2 rounded-xl transition">
                      + 依頼（タスク）を作成
                    </button>
                  )}
                </div>
              ) : (
                tasks.map((t) => {
                  const rem = reminderLevel(t);
                  const rs = REMINDER_STYLE[rem];
                  const cfg = STATUS_CONFIG[t.status];
                  return (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="block rounded-xl border border-gray-200 bg-gray-100 hover:bg-gray-100 px-4 py-3 transition group"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${t.status === "completed" ? "line-through text-gray-500" : "text-gray-800 group-hover:text-gray-800"}`}>{t.title}</p>
                          <p className="text-[11px] text-gray-500 truncate">
                            期日 {formatDeadline(t.deadline)} ・ 担当 {t.members.filter((m) => m.role !== "owner").map((m) => m.name).join("、") || "未割当"}
                          </p>
                        </div>
                        {(rem === "overdue" || rem === "today" || rem === "soon") && (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${rs.badge}`}>{rs.label}</span>
                        )}
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>{cfg.label}</span>
                        <span className="text-gray-400 group-hover:text-emerald-400 transition flex-shrink-0">›</span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
          {/* 作成ボタン（コンポーザ位置） */}
          <div className="flex-shrink-0 border-t border-gray-200 p-3">
            <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                {canManage ? "依頼をタスク化すると、担当者のマイページ・タスク一覧に反映されます。" : "依頼の作成はチャンネル参加メンバーのみ可能です。"}
              </p>
              {canManage && (
                <button onClick={openTaskBlank} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition flex-shrink-0">
                  + 依頼（タスク）を作成
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">招待メンバー</span>
              {canManage ? (
                <button onClick={() => setShowAdd(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition">
                  + メンバーを招待
                </button>
              ) : (
                <span className="text-xs text-gray-500">招待はチャンネル参加メンバーのみ</span>
              )}
            </div>
            {talk.members.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center bg-gray-100 rounded-xl border border-dashed border-gray-300">まだ招待メンバーがいません</p>
            ) : (
              <div className="bg-gray-100 rounded-xl border border-gray-200 divide-y divide-gray-200">
                {talk.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{m.name.charAt(0)}</span>
                    <p className="text-sm text-gray-700 flex-1 min-w-0 truncate">{m.name}</p>
                    {canManage && (
                      <button onClick={() => removeMember(m.id)} className="text-xs text-gray-500 hover:text-rose-400 transition px-1">外す</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateTask && (
        <CreateTaskModal
          channelId={channel.id}
          channelName={channel.name}
          talkId={talk.id}
          talkName={talk.name}
          candidates={taskCandidates.length > 0 ? taskCandidates : [{ id: meId, name: "自分" }]}
          initialTitle={taskPrefill.title}
          initialDescription={taskPrefill.description}
          onClose={() => setShowCreateTask(false)}
          onCreated={async (task) => {
            setTasks((prev) => [task, ...prev]);
            setShowCreateTask(false);
            // チャットに起票を告知（依頼へのリンク付き）
            try {
              const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: `依頼（タスク）を作成しました: ${task.title}`,
                  taskId: task.id,
                  taskTitle: task.title,
                  kind: "system",
                }),
              });
              const d = await res.json();
              if (res.ok && d.message) setMessages((prev) => [...prev, d.message]);
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      {showAdd && (
        <AddMembersModal
          title="トークルームにメンバーを招待"
          existingIds={talk.members.map((m) => m.id)}
          onClose={() => setShowAdd(false)}
          onSubmit={async (picked) => {
            const res = await fetch(`/api/task-channels/${channel.id}/talks/${talk.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addMembers: picked }),
            });
            const d = await res.json();
            if (res.ok) {
              onTalkUpdated(d.talk);
              setShowAdd(false);
            } else {
              alert(d?.error ?? "招待に失敗しました");
            }
          }}
        />
      )}

      {showQuotePicker && (
        <QuotePicker
          onClose={() => setShowQuotePicker(false)}
          onPick={(q) => {
            setQuoteDraft(q);
            setShowQuotePicker(false);
            setComposerOpen(true);
          }}
        />
      )}

      {showFileSearch && (
        <FileSearchModal
          talkName={talk.name}
          messages={messages}
          onClose={() => setShowFileSearch(false)}
        />
      )}
    </div>
  );
}

/* ------------ ファイル検索（トークルーム内の添付を検索） ------------ */
function FileSearchModal({
  talkName,
  messages,
  onClose,
}: {
  talkName: string;
  messages: TalkMessage[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "file">("all");

  // メッセージ横断で添付を収集（新しい順）
  const allFiles = [...messages]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((m) =>
      (m.attachments ?? []).map((a, idx) => ({
        att: a as TalkAttachmentT,
        authorName: m.authorName,
        createdAt: m.createdAt,
        key: `${m.id}-${idx}`,
      }))
    );

  const q = search.trim().toLowerCase();
  const filtered = allFiles.filter(({ att, authorName }) => {
    const isImg = isImageAttachment(att);
    if (kind === "image" && !isImg) return false;
    if (kind === "file" && isImg) return false;
    if (!q) return true;
    return (
      (att.name || "").toLowerCase().includes(q) ||
      (att.type || "").toLowerCase().includes(q) ||
      authorName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-white border border-gray-300 shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">📎 ファイル検索</span>
          <span className="text-[12px] text-gray-500 truncate">{talkName}</span>
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-gray-600">✕</button>
        </div>
        <div className="px-4 py-3 border-b border-gray-200 space-y-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ファイル名・種類・投稿者で検索..."
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="flex items-center gap-1.5">
            {([
              ["all", "すべて"],
              ["file", "ファイル"],
              ["image", "画像"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  kind === k ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-[12px] text-gray-500">{filtered.length}件</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center">
              {allFiles.length === 0 ? "このトークルームには添付ファイルがありません" : "該当するファイルがありません"}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(({ att, authorName, createdAt, key }) => (
                <a
                  key={key}
                  href={att.dataUrl}
                  download={isImageAttachment(att) ? undefined : att.name || "file"}
                  target={isImageAttachment(att) ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-gray-200 hover:border-emerald-500 bg-gray-50 px-3 py-2 transition"
                >
                  {isImageAttachment(att) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={att.dataUrl} alt={att.name || "画像"} className="h-11 w-11 object-cover rounded-md border border-gray-300 flex-shrink-0" />
                  ) : (
                    <span className="h-11 w-11 flex items-center justify-center text-2xl flex-shrink-0">{fileIcon(att)}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-gray-800">{att.name || "ファイル"}</span>
                    <span className="block text-[11px] text-gray-500 truncate">
                      {authorName} ・ {fmt(createdAt)}{formatBytes(att.size) ? ` ・ ${formatBytes(att.size)}` : ""}
                    </span>
                  </span>
                  <span className="text-[11px] text-emerald-400 flex-shrink-0">{isImageAttachment(att) ? "開く" : "保存"}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------ 引用ピッカー（他のトークルームのメッセージを選ぶ） ------------ */
function QuotePicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (quote: TalkQuote) => void;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [talks, setTalks] = useState<Talk[]>([]);
  const [msgs, setMsgs] = useState<TalkMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selChannel, setSelChannel] = useState<Channel | null>(null);
  const [selTalk, setSelTalk] = useState<Talk | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/task-channels")
      .then((r) => r.json())
      .then((d) => setChannels(d?.channels ?? []))
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, []);

  const openChannel = async (c: Channel) => {
    setSelChannel(c);
    setSelTalk(null);
    setMsgs([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/task-channels/${c.id}`);
      const d = await res.json();
      setTalks(res.ok ? d.talks ?? [] : []);
    } catch {
      setTalks([]);
    } finally {
      setLoading(false);
    }
  };

  const openTalk = async (t: Talk) => {
    setSelTalk(t);
    setMsgs([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/task-channels/${t.channelId}/talks/${t.id}/messages`);
      const d = await res.json();
      setMsgs(res.ok ? (d.messages ?? []).filter((m: TalkMessage) => m.kind !== "system") : []);
    } catch {
      setMsgs([]);
    } finally {
      setLoading(false);
    }
  };

  const pick = (m: TalkMessage) => {
    if (!selChannel || !selTalk) return;
    onPick({
      messageId: m.id,
      talkId: selTalk.id,
      channelId: selChannel.id,
      talkName: selTalk.name,
      authorName: m.authorName,
      text: (m.text || (m.attachments?.length ? "[画像]" : "")).slice(0, 500),
      createdAt: m.createdAt,
    });
  };

  const filteredMsgs = search.trim()
    ? msgs.filter((m) => (m.text || "").toLowerCase().includes(search.trim().toLowerCase()))
    : msgs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[80vh] rounded-2xl bg-white border border-gray-300 shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">❝ 引用するメッセージを選択</span>
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-gray-600">✕</button>
        </div>
        {/* パンくず */}
        <div className="flex items-center gap-1 px-4 py-2 text-[12px] text-gray-500 border-b border-gray-200 flex-wrap">
          <button onClick={() => { setSelChannel(null); setSelTalk(null); setTalks([]); setMsgs([]); }} className="hover:text-emerald-300">チャンネル</button>
          {selChannel && <><span>›</span><button onClick={() => openChannel(selChannel)} className="hover:text-emerald-300">{selChannel.name}</button></>}
          {selTalk && <><span>›</span><span className="text-gray-700 font-bold">{selTalk.name}</span></>}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-sm text-gray-500 py-10 text-center">読み込み中...</p>
          ) : !selChannel ? (
            <div className="grid gap-1.5">
              {channels.length === 0 ? (
                <p className="text-sm text-gray-500 py-10 text-center">チャンネルがありません</p>
              ) : (
                channels.map((c) => (
                  <button key={c.id} onClick={() => openChannel(c)} className="text-left rounded-lg border border-gray-200 hover:border-emerald-500 bg-gray-50 px-3 py-2 text-sm text-gray-700 transition flex items-center gap-2">
                    <span className="text-emerald-400">#</span>{c.name}
                  </button>
                ))
              )}
            </div>
          ) : !selTalk ? (
            <div className="grid gap-1.5">
              {talks.length === 0 ? (
                <p className="text-sm text-gray-500 py-10 text-center">トークルームがありません</p>
              ) : (
                talks.map((t) => (
                  <button key={t.id} onClick={() => openTalk(t)} className="text-left rounded-lg border border-gray-200 hover:border-emerald-500 bg-gray-50 px-3 py-2 text-sm text-gray-700 transition flex items-center gap-2">
                    <span className="text-sky-400">💬</span>{t.name}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="メッセージを検索..."
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {filteredMsgs.length === 0 ? (
                <p className="text-sm text-gray-500 py-10 text-center">メッセージがありません</p>
              ) : (
                filteredMsgs.map((m) => (
                  <button key={m.id} onClick={() => pick(m)} className="w-full text-left rounded-lg border border-gray-200 hover:border-sky-500 bg-gray-50 px-3 py-2 transition">
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="font-bold text-gray-700">{m.authorName}</span>
                      <span>{fmt(m.createdAt)}</span>
                      {m.parentId && <span className="text-emerald-400">↩ 返信</span>}
                    </div>
                    {m.subject && <p className="text-[13px] font-bold text-gray-800 mt-0.5">{m.subject}</p>}
                    <p className="mt-0.5 text-[13px] text-gray-600 whitespace-pre-wrap break-words line-clamp-3">
                      {m.text || (m.attachments?.length ? "[画像]" : "")}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------ チャンネル概要ビュー ------------ */
function ChannelView({
  channel,
  talks,
  isAdmin,
  canCreateTalk,
  onOpenTalk,
  onCreateTalk,
  onChannelUpdated,
}: {
  channel: Channel;
  talks: Talk[];
  isAdmin: boolean;
  canCreateTalk: boolean;
  onOpenTalk: (talkId: string) => void;
  onCreateTalk: () => void;
  onChannelUpdated: (c: Channel) => void;
}) {
  const [tab, setTab] = useState<"talks" | "members" | "analytics">("talks");
  const [showAdd, setShowAdd] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(channel.name);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setNameInput(channel.name);
    setEditingName(false);
  }, [channel.id, channel.name]);

  const saveName = async () => {
    const name = nameInput.trim();
    if (!name || name === channel.name) {
      setEditingName(false);
      setNameInput(channel.name);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/task-channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (res.ok) {
        onChannelUpdated(d.channel);
        setEditingName(false);
      } else alert(d?.error ?? "名称変更に失敗しました");
    } finally {
      setSavingName(false);
    }
  };

  const removeChannelMember = async (id: string) => {
    if (!confirm("このメンバーをチャンネルから削除しますか？")) return;
    const res = await fetch(`/api/task-channels/${channel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeMemberId: id }),
    });
    const d = await res.json();
    if (res.ok) onChannelUpdated(d.channel);
    else alert(d?.error ?? "削除に失敗しました");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 border-b border-gray-200 px-5 pt-3">
        <div className="flex items-center gap-3">
          <span className={`w-10 h-10 rounded-lg ${colorFor(channel.id)} flex items-center justify-center text-white text-lg font-bold`}>
            {channel.name.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNameInput(channel.name);
                    }
                  }}
                  className="bg-gray-100 border border-emerald-500 rounded px-2 py-1 text-base text-gray-800 w-64 focus:outline-none"
                />
                <button onClick={saveName} disabled={savingName} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 px-1 disabled:opacity-50">
                  {savingName ? "保存中" : "保存"}
                </button>
                <button onClick={() => { setEditingName(false); setNameInput(channel.name); }} className="text-xs text-gray-500 hover:text-gray-600 px-1">
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-bold text-gray-800 truncate">{channel.name}</h1>
                {isAdmin && (
                  <button
                    onClick={() => setEditingName(true)}
                    title="チャンネル名を変更"
                    className="text-gray-500 hover:text-emerald-400 transition text-sm flex-shrink-0"
                  >
                    ✎
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-500 truncate">
              {channel.description ? `${channel.description} ・ ` : ""}メンバー {channel.members.length}名 ・ トークルーム {talks.length}件
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-2">
          {(["talks", "members", "analytics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
                tab === t ? "border-emerald-500 text-gray-800" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "talks" ? "トークルーム" : t === "members" ? "メンバー" : "分析"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="max-w-3xl mx-auto">
          {tab === "talks" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">トークルーム一覧</span>
                {canCreateTalk && (
                  <button onClick={onCreateTalk} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition">
                    + 新規トークルーム
                  </button>
                )}
              </div>
              {talks.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <p className="text-sm font-bold">トークルームがありません</p>
                  {canCreateTalk && <p className="text-xs mt-1">「+ 新規トークルーム」から作成してください</p>}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {talks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onOpenTalk(t.id)}
                      className="w-full flex items-center gap-3 bg-gray-100 hover:bg-gray-100 rounded-xl border border-gray-200 px-4 py-3 text-left transition group"
                    >
                      <span className="text-gray-500 text-lg font-bold flex-shrink-0">#</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate group-hover:text-gray-800">{t.name}</p>
                        {t.description && <p className="text-xs text-gray-500 truncate">{t.description}</p>}
                        <p className="text-[11px] text-gray-500 mt-0.5">招待 {t.members.length}名 ・ 最終更新 {fmt(t.updatedAt)}</p>
                      </div>
                      <span className="text-gray-400 group-hover:text-emerald-400 transition">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "members" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">チャンネル参加メンバー</span>
                {isAdmin ? (
                  <button onClick={() => setShowAdd(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition">
                    + メンバー追加
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">メンバー管理は管理者のみ</span>
                )}
              </div>
              {channel.members.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">メンバーがいません</p>
              ) : (
                <div className="bg-gray-100 rounded-xl border border-gray-200 divide-y divide-gray-200">
                  {channel.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{m.name.charAt(0)}</span>
                      <p className="text-sm text-gray-700 flex-1 min-w-0 truncate">{m.name}</p>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${m.role === "admin" ? "bg-amber-500/20 text-amber-300" : "bg-gray-200 text-gray-600"}`}>
                        {m.role === "admin" ? "管理者" : "メンバー"}
                      </span>
                      {isAdmin && m.role !== "admin" && (
                        <button onClick={() => removeChannelMember(m.id)} className="text-xs text-gray-500 hover:text-rose-400 transition px-1">削除</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ChannelAnalytics channel={channel} talks={talks} />
          )}
        </div>
      </div>

      {showAdd && (
        <AddMembersModal
          title="チャンネルにメンバーを追加"
          existingIds={channel.members.map((m) => m.id)}
          onClose={() => setShowAdd(false)}
          onSubmit={async (picked) => {
            const addMembers = picked.map((p) => ({ id: p.id, name: p.name, role: "member" as const }));
            const res = await fetch(`/api/task-channels/${channel.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addMembers }),
            });
            const d = await res.json();
            if (res.ok) {
              onChannelUpdated(d.channel);
              setShowAdd(false);
            } else {
              alert(d?.error ?? "追加に失敗しました");
            }
          }}
        />
      )}
    </div>
  );
}

function ChannelAnalytics({ channel, talks }: { channel: Channel; talks: Talk[] }) {
  const activeUserIds = new Set<string>();
  channel.members.forEach((m) => activeUserIds.add(m.id));
  talks.forEach((t) => t.members.forEach((m) => activeUserIds.add(m.id)));
  const avgInvites = talks.length > 0 ? talks.reduce((s, t) => s + t.members.length, 0) / talks.length : 0;

  const talkBars = [...talks]
    .map((t) => ({ id: t.id, name: t.name, count: t.members.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const talkMax = Math.max(1, ...talkBars.map((b) => b.count));

  const cards = [
    { label: "アクティブユーザー", value: activeUserIds.size },
    { label: "チャンネルメンバー", value: channel.members.length },
    { label: "トークルーム数", value: talks.length },
    { label: "平均招待人数 / トークルーム", value: avgInvites.toFixed(1) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-gray-100 rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-black text-gray-800">{c.value}</p>
            <p className="text-xs font-bold text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-gray-100 rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-bold text-gray-800 mb-3">トークルーム別 参加人数</p>
        {talkBars.length === 0 ? (
          <p className="text-xs text-gray-500">トークルームがありません</p>
        ) : (
          <div className="space-y-2">
            {talkBars.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-28 truncate flex-shrink-0"># {b.name}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full" style={{ width: `${(b.count / talkMax) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-gray-700 w-10 text-right flex-shrink-0">{b.count}名</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-500">
        ※ 現在の分析は参加状況ベースです。投稿・返信などメッセージ活動の分析は、トークルーム内チャット機能の追加後に対応予定です。
      </p>
    </div>
  );
}

/* ------------ モーダル ------------ */
function CreateChannelModal({
  session,
  onClose,
  onCreated,
}: {
  session: SessionInfo | null;
  onClose: () => void;
  onCreated: (c: Channel) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const meId = session?.employeeId || session?.id || "";
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/staff").then(r => r.json()).then(d => {
      if (Array.isArray(d?.staff)) setStaffList(d.staff);
    }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!name.trim()) {
      setError("チャンネル名を入力してください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const members = selected.map((id) => {
        const emp = staffList.find((e) => e.id === id);
        return { id, name: emp?.name ?? id, role: "member" as const };
      });
      const res = await fetch("/api/task-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), members }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "作成に失敗しました");
        setSaving(false);
        return;
      }
      onCreated(data.channel);
    } catch {
      setError("通信エラーが発生しました");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-gray-800 font-bold text-base">新規チャンネル</h2>
          <button onClick={onClose} className="text-gray-800/70 hover:text-gray-800 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">チャンネル名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: ネットアップ依頼"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">説明（任意）</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="チャンネルの用途"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">参加メンバー</label>
            <p className="text-[11px] text-gray-400 mb-1">作成者（あなた）は自動で管理者として参加します。</p>
            <MemberPicker selectedIds={selected} onChange={setSelected} excludeIds={meId ? [meId] : []} />
          </div>
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">キャンセル</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition disabled:opacity-60">
            {saving ? "作成中..." : "作成する"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateTalkModal({
  channel,
  meId,
  onClose,
  onCreated,
}: {
  channel: Channel;
  meId: string;
  onClose: () => void;
  onCreated: (talk: Talk) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // チャンネルメンバーのみを招待候補にする
  const candidates = channel.members.map((m) => ({ id: m.id, name: m.name }));

  const submit = async () => {
    if (!name.trim()) {
      setError("トークルーム名を入力してください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const members = selected.map((id) => {
        const c = candidates.find((x) => x.id === id);
        return { id, name: c?.name ?? id };
      });
      const res = await fetch(`/api/task-channels/${channel.id}/talks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), members }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "作成に失敗しました");
        setSaving(false);
        return;
      }
      onCreated(data.talk);
    } catch {
      setError("通信エラーが発生しました");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-gray-800 font-bold text-base">新規トークルーム（{channel.name}）</h2>
          <button onClick={onClose} className="text-gray-800/70 hover:text-gray-800 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">トークルーム名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 甲府店"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">説明（任意）</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="トークルームの用途"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">招待するメンバー</label>
            <p className="text-[11px] text-gray-400 mb-1">作成者（あなた）は自動で参加します。チャンネルメンバーから選択できます。</p>
            <MemberPicker selectedIds={selected} onChange={setSelected} excludeIds={meId ? [meId] : []} candidates={candidates} />
          </div>
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">キャンセル</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition disabled:opacity-60">
            {saving ? "作成中..." : "作成する"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------ DM会話ビュー ------------ */
function DmView({
  dmChannelId,
  peer,
  meId,
  meName,
  highlightMessageId,
  clearHighlight,
  onMessageSent,
}: {
  dmChannelId: string;
  peer: { id: string; name: string };
  meId: string;
  meName: string;
  /** 通知から遷移した場合のスクロール対象メッセージID */
  highlightMessageId?: string | null;
  clearHighlight?: () => void;
  onMessageSent: () => void;
}) {
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<TalkAttachmentT[]>([]);
  const [dmEditingId, setDmEditingId] = useState<string | null>(null);
  const [dmEditingText, setDmEditingText] = useState("");
  const [dmEditSaving, setDmEditSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dmMembers = [{ id: peer.id, name: peer.name }, ...(meName ? [{ id: meId, name: meName }] : [])];

  const loadMessages = useCallback(() => {
    setLoading(true);
    fetch(`/api/dm-channels/${dmChannelId}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d?.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [dmChannelId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // 通知から遷移した場合: トリガーメッセージまでスクロールしてハイライト
  useEffect(() => {
    if (!highlightMessageId || loading) return;
    const el = document.querySelector(`[data-message-id="${highlightMessageId}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("kt-msg-highlight");
      window.setTimeout(() => el.classList.remove("kt-msg-highlight"), 4000);
    }
    clearHighlight?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMessageId, loading, messages]);

  useEffect(() => {
    // 通知からの遷移でトリガーメッセージへスクロールする場合は最下部への自動スクロールを抑制
    if (highlightMessageId) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const t = text.trim();
    if ((!t && attachments.length === 0) || sending) return;
    setSending(true);
    try {
      const uploadedAttachments = attachments.length > 0
        ? await uploadAttachmentsToStorage(attachments, dmChannelId, dmChannelId)
        : [];
      const mentions = extractMentions(t, dmMembers);
      const res = await fetch(`/api/dm-channels/${dmChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, mentions, attachments: uploadedAttachments }),
      });
      const d = await res.json();
      if (res.ok && d.message) {
        setMessages((prev) => [...prev, d.message]);
        setText("");
        setAttachments([]);
        onMessageSent();
      } else {
        alert(d?.error ?? "送信に失敗しました");
      }
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (id: string, emoji: string) => {
    const res = await fetch(`/api/dm-channels/${dmChannelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactionMessageId: id, emoji }),
    });
    const d = await res.json();
    if (res.ok && d.messages) setMessages(d.messages);
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("このメッセージを削除しますか？")) return;
    const res = await fetch(`/api/dm-channels/${dmChannelId}/messages?messageId=${id}`, { method: "DELETE" });
    if (res.ok) setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const dmStartEdit = (m: TalkMessage) => { setDmEditingId(m.id); setDmEditingText(m.text); };
  const dmCancelEdit = () => { setDmEditingId(null); setDmEditingText(""); };
  const dmSaveEdit = async () => {
    if (!dmEditingId || dmEditSaving) return;
    setDmEditSaving(true);
    try {
      const res = await fetch(`/api/dm-channels/${dmChannelId}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: dmEditingId, text: dmEditingText }),
      });
      if (res.ok) {
        const d = await res.json();
        setMessages((prev) => prev.map((m) => m.id === dmEditingId ? { ...m, ...d.message } : m));
        dmCancelEdit();
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.error ?? "編集に失敗しました");
      }
    } finally {
      setDmEditSaving(false);
    }
  };

  const deleteAttachment = async (messageId: string, attachIndex: number) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.attachments) return;
    const newAttachments = msg.attachments.filter((_, i) => i !== attachIndex);
    const res = await fetch(`/api/dm-channels/${dmChannelId}/messages`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, attachments: newAttachments }),
    });
    if (res.ok) {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, attachments: newAttachments } : m));
    } else {
      alert("添付ファイルの削除に失敗しました");
    }
  };

  const [dmAttachError, setDmAttachError] = useState("");
  const [dmIsDragging, setDmIsDragging] = useState(false);
  const dmDragCounter = useRef(0);

  const addFiles = async (files: File[]) => {
    setDmAttachError("");
    const errors: string[] = [];
    for (const f of files) {
      try {
        if (f.type.startsWith("image/")) {
          const dataUrl = await resizeImageToDataUrl(f);
          setAttachments((prev) => [...prev, { name: f.name, dataUrl, type: f.type, size: f.size }].slice(0, 6));
        } else if (f.size <= 50 * 1024 * 1024) {
          const dataUrl = await fileToDataUrl(f);
          setAttachments((prev) => [...prev, { name: f.name, dataUrl, type: f.type, size: f.size }].slice(0, 6));
        } else {
          errors.push(`${f.name || "ファイル"}は50MBを超えています`);
        }
      } catch { /* ignore */ }
    }
    if (errors.length > 0) setDmAttachError(errors.join(" / "));
  };

  const handleDmDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dmDragCounter.current += 1;
    if (e.dataTransfer?.types?.includes("Files")) setDmIsDragging(true);
  };
  const handleDmDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dmDragCounter.current -= 1;
    if (dmDragCounter.current <= 0) { dmDragCounter.current = 0; setDmIsDragging(false); }
  };
  const handleDmDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDmDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dmDragCounter.current = 0;
    setDmIsDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) addFiles(files);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ヘッダー */}
      <div className="flex-shrink-0 border-b border-gray-200 px-5 py-3 flex items-center gap-3">
        <span className={`w-9 h-9 rounded-full ${colorFor(peer.id)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
          {peer.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-gray-800 truncate">{peer.name}</h1>
          <p className="text-[11px] text-gray-500">ダイレクトチャット</p>
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {loading ? (
            <p className="text-sm text-gray-500 py-10 text-center">読み込み中...</p>
          ) : messages.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-gray-100 mx-auto flex items-center justify-center text-2xl mb-3">💬</div>
              <p className="text-base font-bold text-gray-800">{peer.name} さんとの会話を始めましょう</p>
              <p className="text-sm text-gray-500 mt-1">下のメッセージ欄から最初のメッセージを送信してください。</p>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.authorId === meId;
              const reactions = m.reactions ?? [];
              return (
                <div key={m.id} data-message-id={m.id} className="flex gap-3 group">
                  <span className={`w-8 h-8 rounded-full ${colorFor(m.authorId)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {m.authorName.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-gray-800">{m.authorName}</span>
                      <span className="text-[11px] text-gray-500">{fmt(m.createdAt)}</span>
                      {m.editedAt && <span className="text-[10px] text-gray-400" title={`編集: ${fmt(m.editedAt)}`}>✏️ 編集済み {fmt(m.editedAt)}</span>}
                    </div>
                    <AttachmentViewer attachments={m.attachments} messageId={m.id} isMine={mine} onDeleteAttachment={deleteAttachment} />
                    {dmEditingId === m.id ? (
                      <div className="mt-0.5">
                        <textarea
                          autoFocus
                          value={dmEditingText}
                          onChange={(e) => setDmEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") dmCancelEdit();
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") dmSaveEdit();
                          }}
                          className="w-full rounded-lg border border-indigo-400 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                          rows={3}
                        />
                        <div className="mt-1 flex items-center gap-2">
                          <button onClick={dmSaveEdit} disabled={dmEditSaving} className="text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded-lg transition disabled:opacity-50">
                            {dmEditSaving ? "保存中..." : "保存"}
                          </button>
                          <button onClick={dmCancelEdit} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">キャンセル</button>
                          <span className="text-[10px] text-gray-400 ml-auto">⌘+Enter で保存 / Esc でキャンセル</span>
                        </div>
                      </div>
                    ) : m.text ? (
                      <div className="mt-0.5 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 break-words whitespace-pre-wrap">
                        {renderRichMessage(m.text, dmMembers, meId)}
                      </div>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {reactions.map((r) => (
                        <button
                          key={r.emoji}
                          onClick={() => toggleReaction(m.id, r.emoji)}
                          className={`text-[12px] px-2 py-0.5 rounded-full border transition ${
                            r.userIds.includes(meId)
                              ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-700"
                              : "bg-gray-100 border-gray-300 text-gray-600 hover:border-gray-400"
                          }`}
                        >
                          {r.emoji} {r.userIds.length}
                        </button>
                      ))}
                      <span className="opacity-0 group-hover:opacity-100 transition flex items-center gap-2">
                        <button onClick={() => toggleReaction(m.id, "👍")} className="text-[12px] text-gray-500 hover:text-indigo-400" title="いいね">👍</button>
                        {mine && m.text && <button onClick={() => dmStartEdit(m)} className="text-[11px] text-gray-500 hover:text-sky-400">編集</button>}
                        {mine && <button onClick={() => deleteMessage(m.id)} className="text-[11px] text-gray-500 hover:text-rose-400">削除</button>}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* メッセージ入力 */}
      <div
        className={`flex-shrink-0 border-t border-gray-200 p-3 relative transition-colors ${dmIsDragging ? "bg-indigo-50 border-indigo-400" : ""}`}
        onDragEnter={handleDmDragEnter}
        onDragLeave={handleDmDragLeave}
        onDragOver={handleDmDragOver}
        onDrop={handleDmDrop}
      >
        {dmIsDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-50/80 border-2 border-dashed border-indigo-500 rounded-xl pointer-events-none">
            <div className="text-center">
              <span className="text-3xl">📎</span>
              <p className="text-sm font-bold text-indigo-700 mt-1">ファイルをドロップしてください</p>
              <p className="text-xs text-indigo-600 mt-0.5">最大50MB / 6ファイルまで</p>
            </div>
          </div>
        )}
        <div className="max-w-2xl mx-auto">
          {dmAttachError && <p className="mb-1 text-xs text-rose-400">{dmAttachError}</p>}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative">
                  {isImageAttachment(a) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={a.dataUrl} alt={a.name || "添付"} className="h-16 w-16 object-cover rounded-lg border border-gray-300" />
                  ) : (
                    <div className="flex items-center gap-2 h-16 w-36 rounded-lg border border-gray-300 bg-gray-100 px-2">
                      <span className="text-lg flex-shrink-0">{fileIcon(a)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] text-gray-800">{a.name || "ファイル"}</span>
                        <span className="block text-[10px] text-gray-500">{formatBytes(a.size)}</span>
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-600 text-xs hover:bg-rose-600 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) addFiles(files);
              e.target.value = "";
            }}
          />
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 w-9 h-9 rounded-lg border border-gray-300 hover:border-indigo-500 flex items-center justify-center text-gray-500 hover:text-indigo-500 transition"
              title="ファイル添付"
            >
              📎
            </button>
            <MentionTextarea
              value={text}
              onChange={setText}
              members={dmMembers}
              onSubmit={send}
              onImageFiles={(files) => addFiles(files.filter((f) => f.type.startsWith("image/")))}
              rows={1}
              placeholder={`${peer.name} にメッセージを送信...`}
              className="flex-1 resize-none bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-h-32"
            />
            <button
              onClick={send}
              disabled={sending || (!text.trim() && attachments.length === 0)}
              className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              {sending ? "..." : "送信"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------ 新規DMモーダル ------------ */
function NewDmModal({
  meId,
  onClose,
  onCreated,
}: {
  meId: string;
  onClose: () => void;
  onCreated: (dm: DmChannel) => void;
}) {
  const [staff, setStaff] = useState<{ id: string; name: string; department?: string }[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => {
        const list = (d?.staff ?? []) as { id: string; name: string; department?: string }[];
        setStaff(list.filter((s) => s.id !== meId));
      })
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, [meId]);

  const filtered = search.trim()
    ? staff.filter(
        (s) =>
          s.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          (s.department ?? "").toLowerCase().includes(search.trim().toLowerCase())
      )
    : staff;

  const startDm = async (recipient: { id: string; name: string }) => {
    setCreating(true);
    try {
      const res = await fetch("/api/dm-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: recipient.id, recipientName: recipient.name }),
      });
      const d = await res.json();
      if (res.ok && d.channel) {
        const dm: DmChannel = {
          ...d.channel,
          talkId: d.talkId,
          peer: { id: recipient.id, name: recipient.name },
          messageCount: 0,
        };
        onCreated(dm);
      } else {
        alert(d?.error ?? "DMの作成に失敗しました");
        setCreating(false);
      }
    } catch {
      alert("通信エラーが発生しました");
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-base">新しいダイレクトチャット</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-4">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名前で検索..."
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
          />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {loading ? (
              <p className="text-sm text-gray-500 py-6 text-center">読み込み中...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">スタッフが見つかりません</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => startDm(s)}
                  disabled={creating}
                  className="w-full flex items-center gap-3 rounded-xl hover:bg-gray-50 px-3 py-2.5 text-left transition disabled:opacity-50"
                >
                  <span className={`w-9 h-9 rounded-full ${colorFor(s.id)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                    {s.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                    {s.department && <p className="text-[11px] text-gray-500 truncate">{s.department}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  target,
  onConfirm,
  onCancel,
}: {
  target: { type: "channel"; channel: { id: string; name: string } } | { type: "talk"; channelId: string; talk: { id: string; name: string } };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const isChannel = target.type === "channel";
  const name = isChannel ? target.channel.name : target.talk.name;
  const matched = isChannel ? input === name : true; // talks don't require name input

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-rose-500 to-red-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-base">
            {isChannel ? "チャンネルを削除" : "トークルームを削除"}
          </h2>
          <button onClick={onCancel} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
            <p className="text-sm text-rose-800 font-bold mb-1">
              {isChannel ? "⚠ この操作はチャンネルをアーカイブします" : "⚠ このトークルームを削除しますか？"}
            </p>
            <p className="text-xs text-rose-700">
              {isChannel
                ? `チャンネル「${name}」を削除すると、すべてのトークルームとメッセージが非表示になります。管理者はアーカイブ済みチャンネルから復元できます。`
                : `トークルーム「${name}」を削除すると、メッセージ・依頼（タスク）もすべて削除され、元に戻せません。`}
            </p>
          </div>

          {isChannel && (
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">
                確認のため、チャンネル名 <span className="font-black text-rose-600">{name}</span> を入力してください
              </label>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={name}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                autoFocus
              />
            </div>
          )}

          {!isChannel && (
            <p className="text-sm text-gray-600">
              トークルーム「<span className="font-bold">{name}</span>」を削除してもよろしいですか？
            </p>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={!matched || busy}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "処理中..." : "削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}
