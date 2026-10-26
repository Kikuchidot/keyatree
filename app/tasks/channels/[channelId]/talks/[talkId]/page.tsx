"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import AddMembersModal from "@/components/tasks/AddMembersModal";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import { getClientSession, isAdminSession, sessionMemberId, type SessionInfo } from "@/lib/clientSession";
import { apiListTasks } from "@/lib/taskClient";
import { reminderLevel, REMINDER_STYLE } from "@/lib/taskReminder";
import { STATUS_CONFIG, formatDeadline, type FullTask } from "@/lib/taskStore";

type ChannelMember = { id: string; name: string; role: "admin" | "member"; joinedAt: string };
type Channel = { id: string; name: string; members: ChannelMember[] };
type TalkMember = { id: string; name: string; joinedAt: string };
type Talk = { id: string; channelId: string; name: string; description?: string; members: TalkMember[]; updatedAt: string };

export default function TalkDetailPage({ params }: { params: Promise<{ channelId: string; talkId: string }> }) {
  const { channelId, talkId } = use(params);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [talk, setTalk] = useState<Talk | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [tasks, setTasks] = useState<FullTask[]>([]);

  const isAdmin = isAdminSession(session);
  const meId = sessionMemberId(session);
  const isChannelMember = !!channel && channel.members.some((m) => m.id === meId);
  const canManage = isAdmin || isChannelMember;

  useEffect(() => {
    setSession(getClientSession());
    fetch(`/api/task-channels/${channelId}/talks/${talkId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setChannel(d.channel);
        setTalk(d.talk);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    apiListTasks({ talkId }).then(setTasks).catch(() => setTasks([]));
    // このトークを開いた時点で既読にする（未読バッジの解消）
    fetch("/api/task-channels/unread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ talkId }),
    }).catch(() => {});
  }, [channelId, talkId]);

  const removeMember = async (id: string) => {
    if (!confirm("このメンバーをトークルームから外しますか？")) return;
    const res = await fetch(`/api/task-channels/${channelId}/talks/${talkId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeMemberId: id }),
    });
    const d = await res.json();
    if (res.ok) setTalk(d.talk);
    else alert(d?.error ?? "削除に失敗しました");
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">読み込み中...</div>;
  }
  if (notFound || !talk || !channel) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-gray-500">トークルームが見つかりません</p>
        <Link href={`/tasks/channels/${channelId}`} className="text-emerald-600 text-sm font-bold hover:underline">チャンネルへ戻る</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start gap-3">
          <span className="text-gray-400 text-2xl font-black flex-shrink-0">#</span>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-gray-800 truncate">{talk.name}</h1>
            {talk.description && <p className="text-sm text-gray-500 mt-0.5">{talk.description}</p>}
            <p className="text-xs text-gray-400 mt-1">{channel.name} ・ 招待 {talk.members.length}名</p>
          </div>
        </div>

        {/* 招待メンバー管理 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">招待メンバー</span>
            {canManage ? (
              <button onClick={() => setShowAdd(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition">
                + メンバーを招待
              </button>
            ) : (
              <span className="text-xs text-gray-400">招待はチャンネル参加メンバーのみ</span>
            )}
          </div>
          {talk.members.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center bg-white rounded-2xl border border-dashed">まだ招待メンバーがいません</p>
          ) : (
            <div className="bg-white rounded-2xl border divide-y">
              {talk.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{m.name.charAt(0)}</span>
                  <p className="text-sm text-gray-800 flex-1 min-w-0 truncate">{m.name}</p>
                  {canManage && (
                    <button onClick={() => removeMember(m.id)} className="text-xs text-gray-300 hover:text-rose-500 transition px-1">外す</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 依頼（タスク） */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">依頼（タスク） {tasks.length}件</span>
            {canManage && (
              <button onClick={() => setShowCreateTask(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition">
                + 依頼を作成
              </button>
            )}
          </div>
          {tasks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed p-6 text-center">
              <p className="text-sm font-bold text-gray-500">このトークルームの依頼はまだありません</p>
              <p className="text-xs text-gray-400 mt-1">依頼をタスク化すると、担当者のマイページ・タスク一覧に反映されます。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => {
                const rem = reminderLevel(t);
                const rs = REMINDER_STYLE[rem];
                const cfg = STATUS_CONFIG[t.status];
                return (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="block bg-white rounded-2xl border px-4 py-3 hover:shadow-md transition group">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${t.status === "completed" ? "line-through text-gray-400" : "text-gray-800"}`}>{t.title}</p>
                        <p className="text-xs text-gray-400 truncate">
                          期日 {formatDeadline(t.deadline)} ・ 担当 {t.members.filter((m) => m.role !== "owner").map((m) => m.name).join("、") || "未割当"}
                        </p>
                      </div>
                      {(rem === "overdue" || rem === "today" || rem === "soon") && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${rs.badge}`}>{rs.label}</span>
                      )}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>{cfg.label}</span>
                      <span className="text-gray-300 group-hover:text-emerald-500 transition flex-shrink-0">›</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {showCreateTask && (
        <CreateTaskModal
          channelId={channelId}
          channelName={channel.name}
          talkId={talkId}
          talkName={talk.name}
          candidates={talk.members.length > 0 ? talk.members.map((m) => ({ id: m.id, name: m.name })) : [{ id: meId, name: "自分" }]}
          onClose={() => setShowCreateTask(false)}
          onCreated={(task) => {
            setTasks((prev) => [task, ...prev]);
            setShowCreateTask(false);
          }}
        />
      )}

      {showAdd && (
        <AddMembersModal
          title="トークルームにメンバーを招待"
          existingIds={talk.members.map((m) => m.id)}
          candidates={channel.members.map((m) => ({ id: m.id, name: m.name }))}
          onClose={() => setShowAdd(false)}
          onSubmit={async (picked) => {
            const res = await fetch(`/api/task-channels/${channelId}/talks/${talkId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addMembers: picked }),
            });
            const d = await res.json();
            if (res.ok) {
              setTalk(d.talk);
              setShowAdd(false);
            } else {
              alert(d?.error ?? "招待に失敗しました");
            }
          }}
        />
      )}
    </div>
  );
}
