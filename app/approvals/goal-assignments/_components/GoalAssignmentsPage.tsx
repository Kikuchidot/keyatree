"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { NavigatorKind, RecordStatus } from "@/lib/goalNavigatorStore";
import {
  getGoalAssignmentsAction,
  removeGoalAssignmentAction,
  saveGoalAssignmentAction,
  saveRosterOrderAction,
  setRosterTargetAction,
  type SheetRecordInfo,
} from "@/lib/goalAssignmentActions";
import {
  approveNavigatorRecordAction,
  rejectNavigatorRecordAction,
} from "@/lib/goalNavigatorActions";

type StaffLite = {
  id: string;
  name: string;
  photo: string;
  team: string;
};

type RowState = {
  primaryId: string;
  secondaryId: string;
  configured: boolean;
  saving: boolean;
  error?: string;
};

const KIND_LABEL: Record<NavigatorKind, string> = {
  quantitative: "定量目標設定シート",
  qualitative: "定性目標設定シート",
};

const SUBMIT_STATUS: Record<RecordStatus | "none", { label: string; cls: string }> = {
  none: { label: "未対応", cls: "bg-gray-100 text-gray-500" },
  draft: { label: "下書き", cls: "bg-gray-100 text-gray-500" },
  submitted: { label: "提出済み", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "承認済み", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "差戻", cls: "bg-rose-100 text-rose-700" },
};

const APPROVE_STATUS: Record<RecordStatus | "none", { label: string; cls: string }> = {
  none: { label: "未対応", cls: "bg-gray-100 text-gray-500" },
  draft: { label: "提出待ち", cls: "bg-gray-100 text-gray-500" },
  submitted: { label: "承認待ち", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "承認済み", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "差戻済み", cls: "bg-rose-100 text-rose-700" },
};

function StatusBadge({ info }: { info: { label: string; cls: string } }) {
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${info.cls}`}>
      {info.label}
    </span>
  );
}

function Avatar({ staff, size = "w-9 h-9" }: { staff?: StaffLite; size?: string }) {
  if (!staff) {
    return (
      <div className={`${size} rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs font-black`}>
        ？
      </div>
    );
  }
  if (staff.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={staff.photo}
        alt={staff.name}
        draggable={false}
        className={`${size} rounded-full object-cover border border-gray-200`}
      />
    );
  }
  return (
    <div className={`${size} rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black`}>
      {staff.name.slice(0, 1)}
    </div>
  );
}

function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${y}年${m}月`;
}

function defaultOrder(staff: StaffLite[]): string[] {
  return [...staff]
    .sort((a, b) => (a.team + a.name).localeCompare(b.team + b.name, "ja"))
    .map((s) => s.id);
}

export default function GoalAssignmentsPage({
  initialPeriod,
  initialStaff,
}: {
  initialPeriod: string;
  initialStaff: StaffLite[];
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [kind, setKind] = useState<NavigatorKind>("quantitative");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [records, setRecords] = useState<Record<string, SheetRecordInfo>>({});
  const [order, setOrder] = useState<string[]>(() => defaultOrder(initialStaff));
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const loadedKey = useRef("");

  const staffById = useMemo(() => {
    const map = new Map<string, StaffLite>();
    for (const s of initialStaff) map.set(s.id, s);
    return map;
  }, [initialStaff]);

  const load = useCallback(
    (p: string, k: NavigatorKind) => {
      setLoading(true);
      startTransition(async () => {
        const res = await getGoalAssignmentsAction(p, k);
        if (!res.ok) {
          setNotice(res.message || "読み込みに失敗しました");
          setLoading(false);
          return;
        }
        setNotice("");
        const map: Record<string, RowState> = {};
        for (const s of initialStaff) {
          map[s.id] = {
            primaryId: "",
            secondaryId: "",
            configured: false,
            saving: false,
          };
        }
        for (const a of res.assignments) {
          map[a.employeeId] = {
            primaryId: a.primaryApproverId,
            secondaryId: a.secondaryApproverId || "",
            configured: true,
            saving: false,
          };
        }
        setRows(map);
        setRecords(
          Object.fromEntries(res.records.map((r) => [r.employeeId, r]))
        );

        // 保存済みの順序 + 未登録のスタッフを末尾に追加
        const known = new Set(initialStaff.map((s) => s.id));
        const saved = res.roster.order.filter((id) => known.has(id));
        const rest = defaultOrder(initialStaff).filter((id) => !saved.includes(id));
        setOrder([...saved, ...rest]);
        setExcluded(new Set(res.roster.excludedIds));
        setLoading(false);
      });
    },
    [initialStaff]
  );

  useEffect(() => {
    const key = `${period}__${kind}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    load(period, kind);
  }, [period, kind, load]);

  const staffOptions = useMemo(
    () =>
      [...initialStaff].sort((a, b) =>
        (a.team + a.name).localeCompare(b.team + b.name, "ja")
      ),
    [initialStaff]
  );

  const orderedStaff = useMemo(
    () => order.map((id) => staffById.get(id)).filter((s): s is StaffLite => Boolean(s)),
    [order, staffById]
  );

  const visibleStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orderedStaff;
    return orderedStaff.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || (s.team || "").toLowerCase().includes(q)
    );
  }, [orderedStaff, search]);

  const configuredCount = useMemo(
    () => Object.values(rows).filter((r) => r.configured).length,
    [rows]
  );
  const targetCount = useMemo(
    () => initialStaff.filter((s) => !excluded.has(s.id)).length,
    [initialStaff, excluded]
  );

  function patchRow(employeeId: string, patch: Partial<RowState>) {
    setRows((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], ...patch },
    }));
  }

  function handleChange(employeeId: string, field: "primaryId" | "secondaryId", value: string) {
    const current = rows[employeeId];
    if (!current) return;
    const next: RowState = { ...current, [field]: value, error: undefined };
    setRows((prev) => ({ ...prev, [employeeId]: next }));

    startTransition(async () => {
      patchRow(employeeId, { saving: true });
      if (!next.primaryId) {
        if (current.configured) {
          const res = await removeGoalAssignmentAction({ period, employeeId });
          if (!res.ok) {
            patchRow(employeeId, { saving: false, error: res.message });
            return;
          }
        }
        patchRow(employeeId, { saving: false, configured: false, secondaryId: "" });
        return;
      }
      const res = await saveGoalAssignmentAction({
        period,
        employeeId,
        primaryApproverId: next.primaryId,
        secondaryApproverId: next.secondaryId || undefined,
      });
      if (!res.ok) {
        patchRow(employeeId, { saving: false, error: res.message });
        return;
      }
      patchRow(employeeId, { saving: false, configured: true });
    });
  }

  function move(employeeId: string, dir: -1 | 1) {
    const idx = order.indexOf(employeeId);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[idx], next[to]] = [next[to], next[idx]];
    applyOrder(next);
  }

  /** ドラッグで droppedId の位置へ移動 */
  function moveTo(draggedId: string, droppedId: string) {
    if (draggedId === droppedId) return;
    const from = order.indexOf(draggedId);
    const to = order.indexOf(droppedId);
    if (from < 0 || to < 0) return;
    const next = order.filter((id) => id !== draggedId);
    next.splice(to, 0, draggedId);
    applyOrder(next);
  }

  function applyOrder(next: string[]) {
    setOrder(next);
    startTransition(async () => {
      const res = await saveRosterOrderAction({ orderedIds: next });
      if (!res.ok) setNotice(res.message || "並び順の保存に失敗しました");
    });
  }

  function toggleTarget(employeeId: string) {
    const willBeTarget = excluded.has(employeeId);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (willBeTarget) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
    // 対象外にした場合は並び順の一番下へ移動（全員共通で保存）
    let nextOrder: string[] | null = null;
    if (!willBeTarget && order.indexOf(employeeId) !== order.length - 1) {
      nextOrder = [...order.filter((id) => id !== employeeId), employeeId];
      setOrder(nextOrder);
    }
    startTransition(async () => {
      const res = await setRosterTargetAction({
        employeeId,
        isTarget: willBeTarget,
      });
      if (!res.ok) {
        setNotice(res.message || "対象設定の保存に失敗しました");
        setExcluded((prev) => {
          const next = new Set(prev);
          if (willBeTarget) next.add(employeeId);
          else next.delete(employeeId);
          return next;
        });
        return;
      }
      if (nextOrder) {
        const orderRes = await saveRosterOrderAction({ orderedIds: nextOrder });
        if (!orderRes.ok) setNotice(orderRes.message || "並び順の保存に失敗しました");
      }
    });
  }

  function setRecordStatus(employeeId: string, status: RecordStatus) {
    setRecords((prev) => {
      const current = prev[employeeId];
      if (!current) return prev;
      return { ...prev, [employeeId]: { ...current, status } };
    });
  }

  function handleApprove(employeeId: string) {
    const rec = records[employeeId];
    if (!rec || rec.status !== "submitted") return;
    startTransition(async () => {
      const res = await approveNavigatorRecordAction(rec.recordId);
      if (!res.ok) {
        setNotice(res.message || "確定に失敗しました");
        return;
      }
      setRecordStatus(employeeId, "approved");
    });
  }

  function handleReject(employeeId: string) {
    const rec = records[employeeId];
    if (!rec || rec.status !== "submitted") return;
    const reason = window.prompt("差戻しの理由を入力してください");
    if (!reason || !reason.trim()) return;
    startTransition(async () => {
      const res = await rejectNavigatorRecordAction(rec.recordId, reason.trim());
      if (!res.ok) {
        setNotice(res.message || "差戻しに失敗しました");
        return;
      }
      setRecordStatus(employeeId, "rejected");
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-black text-gray-800">
            目標設定シート｜承認者割り当て
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            対象期間を指定し、設定者ごとに一次承認者・二次承認者を設定します。
            承認者の組み合わせは定量・定性どちらのシートにも共通で適用されます。
            提出ファイルの切替は各シートの提出状況を確認するためのものです。
            対象／対象外の設定と並び順は全期間・全シートに共通で適用されます。
          </p>
        </div>

        {/* 対象期間・ファイル指定（全員共通） */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">
                対象期間
              </label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">
                提出ファイル
              </label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                {(Object.keys(KIND_LABEL) as NavigatorKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`px-4 py-2 text-sm font-bold transition-colors ${
                      kind === k
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-sm font-black text-gray-700 pb-2">
              {periodLabel(period)}｜{KIND_LABEL[kind]}
            </div>
          </div>
        </div>

        {notice ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
            {notice}
          </div>
        ) : null}

        {/* 対象者一覧 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-black text-gray-800">対象者一覧</h2>
            <span className="text-[11px] text-gray-400 font-medium">
              行をドラッグして並び替えできます
            </span>
            <div className="flex-1" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前・所属チームで検索"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <span className="text-xs text-gray-500 font-bold whitespace-nowrap">
              {loading
                ? "読み込み中..."
                : `対象 ${targetCount} 名 / 設定済み ${configuredCount} 名`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] text-gray-500">
                  <th className="px-5 py-3 font-bold">設定者</th>
                  <th className="px-4 py-3 font-bold">一次承認者</th>
                  <th className="px-4 py-3 font-bold">二次承認者</th>
                  <th className="px-4 py-3 font-bold w-20">対象</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleStaff.map((s) => {
                  const row = rows[s.id] || {
                    primaryId: "",
                    secondaryId: "",
                    configured: false,
                    saving: false,
                  };
                  const isTarget = !excluded.has(s.id);
                  const pos = order.indexOf(s.id);
                  const isDragging = dragId === s.id;
                  const isDragOver = dragOverId === s.id && dragId !== s.id;
                  const rec = records[s.id];
                  const recStatus: RecordStatus | "none" = rec ? rec.status : "none";
                  const primary = row.primaryId ? staffById.get(row.primaryId) : undefined;
                  const secondary = row.secondaryId ? staffById.get(row.secondaryId) : undefined;
                  // 二次承認者の進行: 一次承認が済んでから待機
                  const secondaryStatus: RecordStatus | "none" =
                    recStatus === "approved" ? "submitted" : recStatus;
                  return (
                    <tr
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        setDragId(s.id);
                        e.dataTransfer.effectAllowed = "move";
                        try {
                          e.dataTransfer.setData("text/plain", s.id);
                        } catch {
                          /* noop */
                        }
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverId(s.id);
                      }}
                      onDragLeave={() => {
                        setDragOverId((prev) => (prev === s.id ? null : prev));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const dropped = dragId || e.dataTransfer.getData("text/plain");
                        setDragId(null);
                        setDragOverId(null);
                        if (dropped) moveTo(dropped, s.id);
                      }}
                      className={[
                        "cursor-grab active:cursor-grabbing",
                        isDragging ? "opacity-40" : "",
                        isDragOver ? "border-t-2 border-t-emerald-500" : "",
                        isTarget ? "hover:bg-gray-50/60" : "bg-gray-50/80 opacity-60",
                      ].join(" ")}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => move(s.id, -1)}
                              disabled={loading || pos <= 0}
                              aria-label="上に移動"
                              className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 text-[10px] font-black hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => move(s.id, 1)}
                              disabled={loading || pos < 0 || pos >= order.length - 1}
                              aria-label="下に移動"
                              className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 text-[10px] font-black hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent"
                            >
                              ↓
                            </button>
                          </div>
                          <span className="text-gray-300 select-none" aria-hidden="true">
                            ⠿
                          </span>
                          <Avatar staff={s} />
                          <div>
                            <div className="font-bold text-gray-800">{s.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <StatusBadge info={SUBMIT_STATUS[recStatus]} />
                              {recStatus === "submitted" && isTarget ? (
                                <span className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(s.id)}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                  >
                                    確定
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReject(s.id)}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors"
                                  >
                                    差戻
                                  </button>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Avatar staff={primary} size="w-7 h-7" />
                          <div>
                            <div className="text-xs font-bold text-gray-700">
                              {primary ? primary.name : "未設定"}
                            </div>
                            <StatusBadge
                              info={primary ? APPROVE_STATUS[recStatus] : APPROVE_STATUS.none}
                            />
                          </div>
                        </div>
                        <select
                          value={row.primaryId}
                          onChange={(e) => handleChange(s.id, "primaryId", e.target.value)}
                          disabled={loading || row.saving || !isTarget}
                          className="w-full max-w-[220px] border border-gray-200 rounded-md px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
                        >
                          <option value="">未設定</option>
                          {staffOptions
                            .filter((o) => o.id !== s.id && o.id !== row.secondaryId)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                        {row.error ? (
                          <div className="text-[10px] font-bold text-rose-600 mt-1">{row.error}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Avatar staff={secondary} size="w-7 h-7" />
                          <div>
                            <div className="text-xs font-bold text-gray-700">
                              {secondary ? secondary.name : "未設定"}
                            </div>
                            <StatusBadge
                              info={
                                secondary
                                  ? APPROVE_STATUS[secondaryStatus]
                                  : APPROVE_STATUS.none
                              }
                            />
                          </div>
                        </div>
                        <select
                          value={row.secondaryId}
                          onChange={(e) => handleChange(s.id, "secondaryId", e.target.value)}
                          disabled={loading || row.saving || !row.primaryId || !isTarget}
                          className="w-full max-w-[220px] border border-gray-200 rounded-md px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
                        >
                          <option value="">なし（後から追加可）</option>
                          {staffOptions
                            .filter((o) => o.id !== s.id && o.id !== row.primaryId)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleTarget(s.id)}
                          disabled={loading}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                            isTarget
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"
                              : "bg-gray-200 text-gray-500 border-gray-300 hover:bg-gray-300"
                          }`}
                        >
                          {isTarget ? "対象" : "対象外"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && visibleStaff.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">
                      検索条件に一致する設定者がいません
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
