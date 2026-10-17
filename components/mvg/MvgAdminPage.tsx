"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  activateMvgEventAction,
  castManualVoteAction,
  deleteMvgEventAction,
  deleteMvgVoteAction,
  getMvgEventsAction,
  getMvgRankingAction,
  getMvgVotesAction,
  saveMvgEventAction,
  updateMvgVoteAction,
} from "@/lib/mvgActions";
import type { MvgVote, MvgRankingEntry } from "@/lib/mvgStore";
import type { MvgEvent } from "@/lib/mvgEventStore";

type Staff = { id: string; name: string; photo?: string; team?: string };

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default function MvgAdminPage({
  initialPeriod,
  initialStaff,
}: {
  initialPeriod: string;
  initialStaff: Staff[];
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [ranking, setRanking] = useState<MvgRankingEntry[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [votes, setVotes] = useState<MvgVote[]>([]);
  const [events, setEvents] = useState<MvgEvent[]>([]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [manualMessage, setManualMessage] = useState("");
  const [manualDate, setManualDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [editingVote, setEditingVote] = useState<MvgVote | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editDate, setEditDate] = useState("");

  // Event editor state
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MvgEvent | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventPeriod, setEventPeriod] = useState(initialPeriod);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const staffMap = useMemo(
    () => new Map(initialStaff.map((s) => [s.id, s])),
    [initialStaff]
  );

  function refresh() {
    startTransition(async () => {
      const [rankRes, votesRes, eventsRes] = await Promise.all([
        getMvgRankingAction(period),
        getMvgVotesAction(period),
        getMvgEventsAction(),
      ]);
      if (rankRes.ok) {
        setRanking(rankRes.ranking);
        setTotalVotes(rankRes.totalVotes);
      }
      if (votesRes.ok) {
        setVotes(votesRes.votes);
      }
      if (eventsRes.ok) {
        setEvents(eventsRes.events);
      }
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function handleManualVote(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!selectedRecipient || !manualMessage.trim()) return;
    const res = await castManualVoteAction(
      selectedRecipient,
      manualMessage,
      manualDate
    );
    if (res.ok) {
      setManualMessage("");
      setMessage("投票を追加しました");
      refresh();
    } else {
      setMessage("エラー: " + res.message);
    }
  }

  async function handleDelete(voteId: string) {
    if (!confirm("この投票を削除しますか？")) return;
    setMessage(null);
    const res = await deleteMvgVoteAction(voteId);
    if (res.ok) {
      setMessage("削除しました");
      refresh();
    } else {
      setMessage("エラー: " + res.message);
    }
  }

  function startEdit(vote: MvgVote) {
    setEditingVote(vote);
    setEditMessage(vote.message);
    setEditDate(vote.votedAt);
  }

  async function handleEditSave() {
    if (!editingVote) return;
    setMessage(null);
    const res = await updateMvgVoteAction(editingVote.id, {
      message: editMessage,
      votedAt: editDate,
    });
    if (res.ok) {
      setEditingVote(null);
      setMessage("更新しました");
      refresh();
    } else {
      setMessage("エラー: " + res.message);
    }
  }

  // Event handlers
  const periodEvents = useMemo(
    () => events.filter((e) => e.period === period).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [events, period]
  );

  function openNewEventForm() {
    setEditingEvent(null);
    setEventTitle(`${period}年度 MVG`);
    setEventPeriod(period);
    setSelectedParticipantIds(initialStaff.map((s) => s.id));
    setShowEventForm(true);
  }

  function openEditEventForm(event: MvgEvent) {
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventPeriod(event.period);
    setSelectedParticipantIds(event.participantIds);
    setShowEventForm(true);
  }

  function toggleParticipant(id: string) {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!eventTitle.trim() || selectedParticipantIds.length === 0) return;
    const res = await saveMvgEventAction({
      id: editingEvent?.id,
      period: eventPeriod,
      title: eventTitle.trim(),
      participantIds: selectedParticipantIds,
      isActive: editingEvent?.isActive ?? true,
    });
    if (res.ok) {
      setShowEventForm(false);
      setMessage(editingEvent ? "MVGを更新しました" : "MVGを作成しました");
      refresh();
    } else {
      setMessage("エラー: " + res.message);
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!confirm("このMVGを削除しますか？")) return;
    setMessage(null);
    const res = await deleteMvgEventAction(id);
    if (res.ok) {
      setMessage("MVGを削除しました");
      refresh();
    } else {
      setMessage("エラー: " + res.message);
    }
  }

  async function handleActivateEvent(id: string) {
    setMessage(null);
    const res = await activateMvgEventAction(id);
    if (res.ok) {
      setMessage("有効なMVGに設定しました");
      refresh();
    } else {
      setMessage("エラー: " + res.message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">MVG 集計管理</h1>
            <p className="text-sm text-gray-500">
              投票の閲覧・編集・削除、およびランキング集計ができます。閲覧権限のあるメンバーのみアクセスできます。
            </p>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 focus:border-emerald-400 focus:outline-none"
          >
            {Array.from({ length: 5 }).map((_, i) => {
              const y = (new Date().getFullYear() - i).toString();
              return (
                <option key={y} value={y}>
                  {y}年
                </option>
              );
            })}
          </select>
        </div>

        {message ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        {isPending ? (
          <div className="flex items-center justify-center py-10">
            <span className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* MVG Event Management */}
            <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-800">
                  {period}年のMVG
                </h2>
                <button
                  onClick={openNewEventForm}
                  className="rounded-lg bg-emerald-500 text-white px-3 py-2 text-xs font-bold hover:bg-emerald-600 transition"
                >
                  新規作成
                </button>
              </div>

              {periodEvents.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {period}年のMVGはまだ作成されていません。新規作成から参加者を選んでください。
                </p>
              ) : (
                <div className="space-y-2">
                  {periodEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`rounded-xl border p-3 ${
                        event.isActive
                          ? "border-emerald-300 bg-emerald-50"
                          : "bg-white"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-800">
                              {event.title}
                            </span>
                            {event.isActive ? (
                              <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                                有効
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                                無効
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            参加者 {event.participantIds.length} 名
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!event.isActive && (
                            <button
                              onClick={() => handleActivateEvent(event.id)}
                              className="rounded-lg border border-emerald-300 text-emerald-700 px-2 py-1 text-xs font-bold hover:bg-emerald-100"
                            >
                              有効にする
                            </button>
                          )}
                          <button
                            onClick={() => openEditEventForm(event)}
                            className="rounded-lg border px-2 py-1 text-xs font-bold hover:bg-gray-50"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="rounded-lg border border-red-200 text-red-600 px-2 py-1 text-xs font-bold hover:bg-red-50"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <h2 className="text-base font-bold text-gray-800 mb-3">
                  ランキング（合計 {totalVotes} 票）
                </h2>
                {ranking.length === 0 ? (
                  <p className="text-sm text-gray-500">投票はまだありません</p>
                ) : (
                  <ol className="space-y-2">
                    {ranking.map((r, idx) => (
                      <li
                        key={r.employeeId}
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-center text-sm font-bold text-gray-400">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-bold text-gray-800">
                            {r.name}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-emerald-600">
                          {r.count} 票
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <h2 className="text-base font-bold text-gray-800 mb-3">
                  手動で投票を追加
                </h2>
                <form onSubmit={handleManualVote} className="space-y-3">
                  <select
                    value={selectedRecipient}
                    onChange={(e) => setSelectedRecipient(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="">受取人を選択</option>
                    {initialStaff
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  />
                  <textarea
                    value={manualMessage}
                    onChange={(e) => setManualMessage(e.target.value)}
                    placeholder="感謝メッセージ"
                    required
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-emerald-500 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-600 transition"
                  >
                    追加
                  </button>
                </form>
              </div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h2 className="text-base font-bold text-gray-800 mb-3">
                投票一覧
              </h2>
              {votes.length === 0 ? (
                <p className="text-sm text-gray-500">
                  該当年度の投票はありません
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 pr-4">日付</th>
                        <th className="pb-2 pr-4">投票者</th>
                        <th className="pb-2 pr-4">受取人</th>
                        <th className="pb-2 pr-4">メッセージ</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {votes.map((v) => (
                        <tr key={v.id} className="align-top">
                          <td className="py-3 pr-4 whitespace-nowrap">
                            {formatDate(v.votedAt)}
                          </td>
                          <td className="py-3 pr-4">{v.fromEmployeeName}</td>
                          <td className="py-3 pr-4">{v.toEmployeeName}</td>
                          <td className="py-3 pr-4 max-w-xs">
                            <p className="line-clamp-3 text-gray-700">
                              {v.message}
                            </p>
                          </td>
                          <td className="py-3 pr-2 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startEdit(v)}
                                className="rounded-lg border px-2 py-1 text-xs font-bold hover:bg-gray-50"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => handleDelete(v.id)}
                                className="rounded-lg border border-red-200 text-red-600 px-2 py-1 text-xs font-bold hover:bg-red-50"
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {editingVote ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">投票を編集</h3>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            />
            <textarea
              value={editMessage}
              onChange={(e) => setEditMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingVote(null)}
                className="rounded-lg border px-4 py-2 text-sm font-bold hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleEditSave}
                className="rounded-lg bg-emerald-500 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEventForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">
              {editingEvent ? "MVGを編集" : "MVGを新規作成"}
            </h3>
            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="MVGタイトル"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                />
                <select
                  value={eventPeriod}
                  onChange={(e) => setEventPeriod(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                >
                  {Array.from({ length: 5 }).map((_, i) => {
                    const y = (new Date().getFullYear() - i).toString();
                    return (
                      <option key={y} value={y}>
                        {y}年
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-700">
                    参加者を選択
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedParticipantIds(initialStaff.map((s) => s.id))
                      }
                      className="text-xs text-emerald-600 font-bold hover:underline"
                    >
                      全選択
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedParticipantIds([])}
                      className="text-xs text-gray-500 font-bold hover:underline"
                    >
                      全解除
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto border rounded-lg p-3">
                  {initialStaff
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 rounded-lg border p-2 cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedParticipantIds.includes(s.id)}
                          onChange={() => toggleParticipant(s.id)}
                          className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                        />
                        <span className="text-xs text-gray-800">{s.name}</span>
                      </label>
                    ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  選択中: {selectedParticipantIds.length} 名
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEventForm(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-bold hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={selectedParticipantIds.length === 0}
                  className="rounded-lg bg-emerald-500 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-600 disabled:opacity-50"
                >
                  {editingEvent ? "更新" : "作成"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
