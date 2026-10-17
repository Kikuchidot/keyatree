"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import RecordActions from "@/components/goal-navigator/RecordActions";
import RecordStatusBadge from "@/components/goal-navigator/RecordStatusBadge";
import type { NavigatorKind, NavigatorRecord } from "@/lib/goalNavigatorStore";

type StaffLite = {
  id: string;
  name: string;
  photo: string;
  team: string;
};

const KIND_LABEL: Record<NavigatorKind, string> = {
  quantitative: "定量目標設定シート",
  qualitative: "定性目標設定シート",
};

function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${y}年${m}月`;
}

function formatDate(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function periodFromRecordTitle(title: string): string | null {
  const m = /^(\d{4})年(\d{2})月/.exec(title);
  return m ? `${m[1]}-${m[2]}` : null;
}

export default function GoalApprovedListPage({
  initialPeriod,
  initialStaff,
  records,
}: {
  initialPeriod: string;
  initialStaff: StaffLite[];
  records: NavigatorRecord[];
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [kind, setKind] = useState<NavigatorKind>("quantitative");
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const staffById = useMemo(() => {
    const map = new Map<string, StaffLite>();
    for (const s of initialStaff) map.set(s.id, s);
    return map;
  }, [initialStaff]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const rp = periodFromRecordTitle(r.title);
      if (rp !== period) return false;
      if (r.kind !== kind) return false;
      return true;
    });
  }, [records, period, kind]);

  const grouped = useMemo(() => {
    const map: Record<
      string,
      { employeeName: string; team: string; records: NavigatorRecord[] }
    > = {};
    for (const record of filteredRecords) {
      const key = record.employeeId || record.employeeName;
      if (!map[key]) {
        map[key] = {
          employeeName: record.employeeName,
          team: record.department || "",
          records: [],
        };
      }
      map[key].records.push(record);
    }
    return map;
  }, [filteredRecords]);

  const visibleStaff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialStaff
      .filter((s) => {
        const hasRecord = grouped[s.id]?.records.length > 0;
        if (!hasRecord) return false;
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.team || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.team + a.name).localeCompare(b.team + b.name, "ja"));
  }, [initialStaff, grouped, query]);

  const totalCount = Object.values(grouped).reduce(
    (sum, g) => sum + g.records.length,
    0
  );

  return (
    <div className="space-y-5">
      {/* 対象期間・ファイル指定 */}
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

      {/* 対象者一覧 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-black text-gray-800">対象者一覧</h2>
          <div className="flex-1" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前・所属チームで検索"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <span className="text-xs text-gray-500 font-bold whitespace-nowrap">
            {totalCount} 件
          </span>
        </div>

        {visibleStaff.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            該当する承認済みの提出者がいません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] text-gray-500">
                  <th className="px-5 py-3 font-bold">設定者</th>
                  <th className="px-4 py-3 font-bold">ステータス</th>
                  <th className="px-4 py-3 font-bold">承認日</th>
                  <th className="px-4 py-3 font-bold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleStaff.map((s) => {
                  const group = grouped[s.id];
                  if (!group) return null;
                  const rec = group.records[0];
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar staff={s} />
                          <div>
                            <div className="font-bold text-gray-800">{s.name}</div>
                            <div className="text-xs text-gray-500">{s.team || "-"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RecordStatusBadge status={rec.status} />
                        {group.records.length > 1 ? (
                          <span className="ml-2 text-[10px] text-gray-400">
                            他 {group.records.length - 1} 件
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(rec.approvedAt || rec.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/approvals/goal-navigators/${rec.id}`}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                          >
                            詳細
                          </Link>
                          <RecordActions record={rec} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
