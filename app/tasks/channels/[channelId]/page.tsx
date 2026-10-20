"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import MemberPicker from "@/components/tasks/MemberPicker";
import AddMembersModal from "@/components/tasks/AddMembersModal";
import { getClientSession, isAdminSession, sessionMemberId, type SessionInfo } from "@/lib/clientSession";
import { getHiddenIds, toggleHiddenId, getSortPref, setSortPref, getOrder, setOrder, applyManualOrder, moveInOrder } from "@/lib/uiPrefs";

type TalkSort = "updated" | "name" | "members" | "manual";

type ChannelMember = { id: string; name: string; role: "admin" | "member"; joinedAt: string };
type Channel = { id: string; name: string; description?: string; members: ChannelMember[]; createdAt: string; updatedAt: string };
type TalkMember = { id: string; name: string; joinedAt: string };
type Talk = { id: string; channelId: string; name: string; description?: string; members: TalkMember[]; updatedAt: string };

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ChannelDetailPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [talks, setTalks] = useState<Talk[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"talks" | "members" | "analytics">("talks");
  const [showTalkModal, setShowTalkModal] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [sort, setSort] = useState<TalkSort>("updated");
  const [hiddenTalks, setHiddenTalks] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [order, setOrderState] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const isAdmin = isAdminSession(session);
  const meId = sessionMemberId(session);
  const isMember = !!channel && channel.members.some((m) => m.id === meId);
  const canCreateTalk = isAdmin || isMember;

  const load = () => {
    fetch(`/api/task-channels/${channelId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setChannel(d.channel);
        setTalks(d.talks ?? []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setSession(getClientSession());
    setHiddenTalks(getHiddenIds(`talks_${channelId}`));
    setSort(getSortPref(`talks`, "updated") as TalkSort);
    setOrderState(getOrder(`talks_${channelId}`));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const changeSort = (s: TalkSort) => {
    setSort(s);
    setSortPref("talks", s);
  };

  const toggleHide = (id: string) => {
    setHiddenTalks(toggleHiddenId(`talks_${channelId}`, id));
  };

  const sortedTalks = sort === "manual"
    ? applyManualOrder(talks, order)
    : [...talks].sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "ja");
        if (sort === "members") return b.members.length - a.members.length;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  const visibleTalks = showHidden ? sortedTalks : sortedTalks.filter((t) => !hiddenTalks.includes(t.id));
  const hiddenCount = talks.filter((t) => hiddenTalks.includes(t.id)).length;

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const moved = moveInOrder(sortedTalks.map((t) => t.id), dragId, targetId);
    setOrderState(moved);
    setOrder(`talks_${channelId}`, moved);
    changeSort("manual");
    setDragId(null);
    setDragOverId(null);
  };

  const removeChannelMember = async (id: string) => {
    if (!confirm("このメンバーをチャンネルから削除しますか？")) return;
    const res = await fetch(`/api/task-channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeMemberId: id }),
    });
    const d = await res.json();
    if (res.ok) setChannel(d.channel);
    else alert(d?.error ?? "削除に失敗しました");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">読み込み中...</div>
    );
  }
  if (notFound || !channel) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-gray-500">チャンネルが見つかりません</p>
        <Link href="/tasks/channels" className="text-emerald-600 text-sm font-bold hover:underline">チャンネル一覧へ</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* チャンネルヘッダー */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-lg font-black flex-shrink-0">
            {channel.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-gray-800 truncate">{channel.name}</h1>
            {channel.description && <p className="text-sm text-gray-500 mt-0.5">{channel.description}</p>}
            <p className="text-xs text-gray-400 mt-1">メンバー {channel.members.length}名 ・ トーク {talks.length}件</p>
          </div>
        </div>

        {/* タブ */}
        <div className="flex border-b">
          {(["talks", "members", "analytics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${tab === t ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}
            >
              {t === "talks" ? "トーク" : t === "members" ? "メンバー" : "分析"}
            </button>
          ))}
        </div>

        {tab === "talks" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-700">トーク一覧</span>
              <div className="flex items-center gap-2">
                <select
                  value={sort}
                  onChange={(e) => changeSort(e.target.value as TalkSort)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="updated">並べ替え: 最終更新順</option>
                  <option value="name">並べ替え: 名前順（あ→ん）</option>
                  <option value="members">並べ替え: 招待人数が多い順</option>
                  <option value="manual">並べ替え: 手動（ドラッグ）</option>
                </select>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setShowHidden((v) => !v)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                  >
                    {showHidden ? "非表示を隠す" : `非表示を表示 (${hiddenCount})`}
                  </button>
                )}
                {canCreateTalk && (
                  <button
                    onClick={() => setShowTalkModal(true)}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition"
                  >
                    + 新規トーク
                  </button>
                )}
              </div>
            </div>
            {!canCreateTalk && <p className="text-xs text-gray-400">トーク作成は参加メンバーのみ</p>}

            {talks.length === 0 ? (
              <div className="text-center py-14 text-gray-400 bg-white rounded-2xl border border-dashed">
                <p className="text-base font-bold">トークがありません</p>
                {canCreateTalk && <p className="text-sm mt-1">「+ 新規トーク」から作成してください</p>}
              </div>
            ) : visibleTalks.length === 0 ? (
              <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-dashed">
                <p className="text-sm">表示中のトークはありません（すべて非表示）</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleTalks.map((t) => {
                  const hidden = hiddenTalks.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverId !== t.id) setDragOverId(t.id);
                      }}
                      onDragLeave={() => setDragOverId((cur) => (cur === t.id ? null : cur))}
                      onDrop={() => handleDrop(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      className={`flex items-center gap-2 bg-white rounded-2xl border pr-3 transition hover:shadow-md ${
                        dragOverId === t.id && dragId !== t.id ? "border-emerald-400 ring-2 ring-emerald-200" : "border-gray-200 hover:border-emerald-200"
                      } ${dragId === t.id ? "opacity-40" : ""} ${hidden ? "opacity-60" : ""}`}
                    >
                      <span
                        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing select-none pl-3 flex-shrink-0"
                        title="ドラッグで並べ替え"
                      >
                        ⠿
                      </span>
                      <Link
                        href={`/tasks/channels/${channelId}/talks/${t.id}`}
                        className="flex-1 min-w-0 flex items-center gap-3 py-3 group"
                      >
                        <span className="text-gray-400 text-lg font-bold flex-shrink-0">#</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate group-hover:text-emerald-700 transition">{t.name}</p>
                          {t.description && <p className="text-xs text-gray-400 truncate">{t.description}</p>}
                          <p className="text-[11px] text-gray-400 mt-0.5">招待 {t.members.length}名 ・ 最終更新 {fmt(t.updatedAt)}</p>
                        </div>
                        <span className="text-gray-300 group-hover:text-emerald-500 transition text-sm">›</span>
                      </Link>
                      <button
                        onClick={() => toggleHide(t.id)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition flex-shrink-0"
                      >
                        {hidden ? "表示する" : "非表示にする"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : tab === "members" ? (
          <ChannelMembers
            channel={channel}
            isAdmin={isAdmin}
            onRemove={removeChannelMember}
            onAdded={(c) => setChannel(c)}
          />
        ) : (
          <ChannelAnalytics channel={channel} talks={talks} />
        )}
      </main>

      {showTalkModal && (
        <CreateTalkModal
          channelId={channelId}
          candidates={channel.members.map((m) => ({ id: m.id, name: m.name }))}
          meId={meId}
          onClose={() => setShowTalkModal(false)}
          onCreated={(talk) => {
            setShowTalkModal(false);
            setTalks((prev) => [talk, ...prev]);
          }}
        />
      )}
    </div>
  );
}

function ChannelMembers({
  channel,
  isAdmin,
  onRemove,
  onAdded,
}: {
  channel: Channel;
  isAdmin: boolean;
  onRemove: (id: string) => void;
  onAdded: (c: Channel) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">チャンネル参加メンバー</span>
        {isAdmin ? (
          <button
            onClick={() => setShowAdd(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition"
          >
            + メンバー追加
          </button>
        ) : (
          <span className="text-xs text-gray-400">メンバー管理は管理者のみ</span>
        )}
      </div>
      {channel.members.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center bg-white rounded-2xl border border-dashed">メンバーがいません</p>
      ) : (
        <div className="bg-white rounded-2xl border divide-y">
          {channel.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {m.name.charAt(0)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{m.name}</p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${m.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                {m.role === "admin" ? "管理者" : "メンバー"}
              </span>
              {isAdmin && m.role !== "admin" && (
                <button onClick={() => onRemove(m.id)} className="text-xs text-gray-300 hover:text-rose-500 transition px-1">削除</button>
              )}
            </div>
          ))}
        </div>
      )}

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
              onAdded(d.channel);
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
  // 参加ベースの分析（メッセージ活動ログは今後追加予定）
  const activeUserIds = new Set<string>();
  channel.members.forEach((m) => activeUserIds.add(m.id));
  talks.forEach((t) => t.members.forEach((m) => activeUserIds.add(m.id)));

  const avgInvites = talks.length > 0 ? talks.reduce((s, t) => s + t.members.length, 0) / talks.length : 0;

  const talkBars = [...talks]
    .map((t) => ({ id: t.id, name: t.name, count: t.members.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const talkMax = Math.max(1, ...talkBars.map((b) => b.count));

  const memberTalkCount = new Map<string, { name: string; count: number }>();
  channel.members.forEach((m) => memberTalkCount.set(m.id, { name: m.name, count: 0 }));
  talks.forEach((t) =>
    t.members.forEach((m) => {
      const cur = memberTalkCount.get(m.id) ?? { name: m.name, count: 0 };
      cur.count += 1;
      memberTalkCount.set(m.id, cur);
    })
  );
  const memberBars = Array.from(memberTalkCount.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const memberMax = Math.max(1, ...memberBars.map((b) => b.count));

  const cards = [
    { label: "アクティブユーザー", value: activeUserIds.size, hint: "チャンネル・トーク参加者の合計（ユニーク）" },
    { label: "チャンネルメンバー", value: channel.members.length, hint: "" },
    { label: "トーク数", value: talks.length, hint: "" },
    { label: "平均招待人数 / トーク", value: avgInvites.toFixed(1), hint: "" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border p-4">
            <p className="text-2xl font-black text-gray-800">{c.value}</p>
            <p className="text-xs font-bold text-gray-500 mt-1">{c.label}</p>
            {c.hint && <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{c.hint}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border p-5">
        <p className="text-sm font-bold text-gray-700 mb-3">トーク別 参加人数</p>
        {talkBars.length === 0 ? (
          <p className="text-xs text-gray-400">トークがありません</p>
        ) : (
          <div className="space-y-2">
            {talkBars.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-28 truncate flex-shrink-0"># {b.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full" style={{ width: `${(b.count / talkMax) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-gray-700 w-10 text-right flex-shrink-0">{b.count}名</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border p-5">
        <p className="text-sm font-bold text-gray-700 mb-1">メンバー別 参加トーク数</p>
        <p className="text-[11px] text-gray-400 mb-3">各メンバーが招待されているトークの数（アクティブ度の目安）</p>
        {memberBars.length === 0 ? (
          <p className="text-xs text-gray-400">メンバーがいません</p>
        ) : (
          <div className="space-y-2">
            {memberBars.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-28 truncate flex-shrink-0">{b.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-3 rounded-full" style={{ width: `${(b.count / memberMax) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-gray-700 w-14 text-right flex-shrink-0">{b.count}トーク</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        ※ 現在の分析は参加状況ベースです。投稿・返信・リアクションなどメッセージ活動の分析は、トーク内チャット機能の追加後に対応予定です。
      </p>
    </div>
  );
}

function CreateTalkModal({
  channelId,
  candidates,
  meId,
  onClose,
  onCreated,
}: {
  channelId: string;
  candidates: { id: string; name: string }[];
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
  const source = candidates;

  const submit = async () => {
    if (!name.trim()) {
      setError("トーク名を入力してください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const members = selected.map((id) => {
        const c = source.find((x) => x.id === id);
        return { id, name: c?.name ?? id };
      });
      const res = await fetch(`/api/task-channels/${channelId}/talks`, {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-base">新規トーク</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">トーク名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 甲府店"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">説明（任意）</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="トークの用途"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">招待するメンバー</label>
            <p className="text-[11px] text-gray-400 mb-1">作成者（あなた）は自動で参加します。チャンネルメンバーから選択できます。</p>
            <MemberPicker
              selectedIds={selected}
              onChange={setSelected}
              excludeIds={meId ? [meId] : []}
              candidates={source}
            />
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
