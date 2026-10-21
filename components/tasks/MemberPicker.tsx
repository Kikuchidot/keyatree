"use client";

import { useEffect, useState } from "react";

export type PickableMember = { id: string; name: string; department?: string; team?: string };

/**
 * スタッフ一覧から複数メンバーを選択するUI。
 * /api/staff から取得し、取得できない場合は fallback を使用。
 * excludeIds に含まれるメンバーは選択済みとして非表示（既に所属など）。
 */
export default function MemberPicker({
  selectedIds,
  onChange,
  excludeIds = [],
  lockedIds = [],
  fallback = [],
  candidates,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  excludeIds?: string[];
  lockedIds?: string[];
  fallback?: PickableMember[];
  candidates?: PickableMember[];
}) {
  const [members, setMembers] = useState<PickableMember[]>(candidates ?? fallback);
  const [loading, setLoading] = useState(!candidates);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (candidates) {
      setMembers(candidates);
      setLoading(false);
      return;
    }
    let alive = true;
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const staff = (d?.staff ?? []) as { id: string; name: string; department?: string; team?: string }[];
        if (Array.isArray(staff) && staff.length > 0) {
          setMembers(staff.map((s) => ({ id: s.id, name: s.name, department: s.department, team: s.team })));
        }
        // API が空の場合は空リストのままにする（サンプルデータを表示しない）
      })
      .catch(() => {
        // エラー時もサンプルデータを表示しない
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  const toggle = (id: string) => {
    if (lockedIds.includes(id)) return;
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const visible = members
    .filter((m) => !excludeIds.includes(m.id))
    .filter((m) =>
      query.trim()
        ? (m.name + (m.department ?? "") + (m.team ?? "")).includes(query.trim())
        : true,
    );

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="名前・チームで検索..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      />
      <div className="max-h-56 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-1">
        {loading && members.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">読み込み中...</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">候補がありません</p>
        ) : (
          visible.map((m) => {
            const checked = selectedIds.includes(m.id) || lockedIds.includes(m.id);
            const locked = lockedIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                disabled={locked}
                className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                  checked ? "bg-emerald-50" : "hover:bg-gray-50"
                } ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    checked ? "bg-emerald-500 text-white" : "border border-gray-300"
                  }`}
                >
                  {checked ? "✓" : ""}
                </span>
                <span className="w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                  {m.name.charAt(0)}
                </span>
                <span className="text-sm text-gray-700 truncate">{m.name}</span>
                {(m.team || m.department) && (
                  <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0 truncate max-w-[8rem]">
                    {m.team || m.department}
                  </span>
                )}
                {locked && <span className="text-[10px] text-gray-400 flex-shrink-0">固定</span>}
              </button>
            );
          })
        )}
      </div>
      <p className="text-[11px] text-gray-400">{selectedIds.length}名を選択中</p>
    </div>
  );
}
