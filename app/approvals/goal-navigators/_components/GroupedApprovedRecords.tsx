"use client";

import { useMemo, useState } from "react";
import RecordActions from "@/components/goal-navigator/RecordActions";
import RecordStatusBadge from "@/components/goal-navigator/RecordStatusBadge";
import type { NavigatorRecord } from "@/lib/goalNavigatorStore";

function formatDate(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type GroupedRecords = Record<
  string,
  {
    employeeName: string;
    department: string;
    records: NavigatorRecord[];
  }
>;

export default function GroupedApprovedRecords({
  records,
  filterEmployeeIds = new Set<string>(),
}: {
  records: NavigatorRecord[];
  filterEmployeeIds?: Set<string>;
}) {
  const [activeTab, setActiveTab] = useState<"active" | "closed">("closed");
  const [query, setQuery] = useState("");
  const [activeSubmitter, setActiveSubmitter] = useState<string>("");

  const filteredRecords = useMemo(() => {
    let rows = records;
    if (filterEmployeeIds.size > 0) {
      rows = rows.filter((r) => filterEmployeeIds.has(r.employeeId));
    }
    if (activeTab === "active") {
      rows = rows.filter((r) => r.status !== "approved");
    } else {
      rows = rows.filter((r) => r.status === "approved");
    }
    return rows;
  }, [records, filterEmployeeIds, activeTab]);

  const grouped = useMemo(() => {
    return filteredRecords.reduce((acc, record) => {
      const key = record.employeeId || record.employeeName;
      if (!acc[key]) {
        acc[key] = {
          employeeName: record.employeeName,
          department: record.department,
          records: [],
        };
      }
      acc[key].records.push(record);
      return acc;
    }, {} as GroupedRecords);
  }, [filteredRecords]);

  const submitters = useMemo(
    () => Object.entries(grouped).sort((a, b) => a[1].employeeName.localeCompare(b[1].employeeName, "ja")),
    [grouped]
  );

  const filteredSubmitters = useMemo(() => {
    const q = query.trim();
    if (!q) return submitters;
    return submitters.filter(([, group]) => {
      const inName = group.employeeName.includes(q);
      const inDept = group.department.includes(q);
      const inTitle = group.records.some((r) => r.title.includes(q));
      return inName || inDept || inTitle;
    });
  }, [submitters, query]);

  const activeKey =
    filteredSubmitters.some(([key]) => key === activeSubmitter)
      ? activeSubmitter
      : filteredSubmitters[0]?.[0] || "";

  if (records.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
        承認済みのレコードはまだありません
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab("active");
              setActiveSubmitter("");
            }}
            className={`rounded-full px-4 py-2 text-sm font-bold border transition ${
              activeTab === "active"
                ? "bg-emerald-500 text-white border-emerald-500"
                : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
            }`}
          >
            進行中
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("closed");
              setActiveSubmitter("");
            }}
            className={`rounded-full px-4 py-2 text-sm font-bold border transition ${
              activeTab === "closed"
                ? "bg-indigo-500 text-white border-indigo-500"
                : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
            }`}
          >
            終了済み
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="提出者名・所属チーム・タイトルで検索"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm text-gray-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          {activeTab === "active" ? "進行中のレコードはありません" : "終了済みのレコードはありません"}
        </div>
      ) : submitters.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          検索に一致する提出者はいません
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {submitters.map(([key, group]) => (
              <button
                key={key}
                onClick={() => setActiveSubmitter(key)}
                className={`rounded-full px-4 py-2 text-sm font-bold border transition ${
                  activeKey === key
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                }`}
              >
                {group.employeeName}
                <span className="ml-2 text-[10px] opacity-80">
                  ({group.records.length})
                </span>
              </button>
            ))}
          </div>

          {activeKey && grouped[activeKey] ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-800">
                    {grouped[activeKey].employeeName}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {grouped[activeKey].department}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
                  {grouped[activeKey].records.length} 件
                </span>
              </div>

              {grouped[activeKey].records.map((record) => (
                <div key={record.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-bold text-gray-800">{record.title}</p>
                        <RecordStatusBadge status={record.status} />
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                            record.kind === "quantitative"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-indigo-50 text-indigo-700"
                          }`}
                        >
                          {record.kind === "quantitative" ? "目標設定" : "定性目標"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        承認日 {formatDate(record.approvedAt || record.updatedAt)}
                      </p>
                      <p className="text-xs text-gray-500">
                        承認者: {record.approvedBy || "-"}
                      </p>
                    </div>
                    <div className="mt-4 lg:mt-0">
                      <RecordActions record={record} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
