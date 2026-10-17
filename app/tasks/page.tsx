"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getCategories, formatDeadline,
  STATUS_CONFIG, PRIORITY_CONFIG,
  type FullTask, type TaskStatus, type TaskType,
} from "@/lib/taskStore";
import { apiListTasks } from "@/lib/taskClient";
import { reminderLevel, REMINDER_STYLE } from "@/lib/taskReminder";

function TaskCard({ task }: { task: FullTask }) {
  const cfg = STATUS_CONFIG[task.status];
  const pri = PRIORITY_CONFIG[task.priority];
  const rem = reminderLevel(task);
  const remStyle = REMINDER_STYLE[rem];
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="block rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm px-4 py-3 transition group"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate text-gray-800 group-hover:text-emerald-700 transition ${task.status === "completed" ? "line-through text-gray-400" : ""}`}>
              {task.title}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{task.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${pri.color}`}>{pri.label}優先</span>
              <span className="text-xs text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">{task.category}</span>
              {task.talkName && (
                <span className="text-xs text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full"># {task.talkName}</span>
              )}
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${task.type === "personal" ? "bg-indigo-50 text-indigo-600" : "bg-teal-50 text-teal-600"}`}>
                {task.type === "personal" ? "個人" : "組織"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pl-5 sm:pl-0">
          {(rem === "overdue" || rem === "today" || rem === "soon") && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${remStyle.badge}`}>{remStyle.label}</span>
          )}
          <span className="text-xs text-gray-500">期日 {formatDeadline(task.deadline)}</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>{cfg.label}</span>
          <div className="flex -space-x-1">
            {task.members.slice(0, 3).map((m) => (
              <div key={m.id} className="w-6 h-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold">
                {m.name.charAt(0)}
              </div>
            ))}
            {task.members.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-gray-600 text-xs font-bold">
                +{task.members.length - 3}
              </div>
            )}
          </div>
          <span className="text-gray-400 group-hover:text-emerald-600 transition">›</span>
        </div>
      </div>
    </Link>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<FullTask[]>([]);
  const [tab, setTab] = useState<"all" | TaskType>("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [talkFilter, setTalkFilter] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    apiListTasks().then(setTasks).catch(() => setTasks([]));
    fetch("/api/task-channels")
      .then((r) => r.json())
      .then((d) => {
        const names = (d?.channels ?? []).map((c: { name: string }) => c.name);
        if (Array.isArray(names) && names.length > 0) setCategories(names);
        else setCategories(getCategories());
      })
      .catch(() => setCategories(getCategories()));
  }, []);

  const filtered = tasks.filter((t) => {
    if (tab !== "all" && t.type !== tab) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (talkFilter !== "all" && t.talkName !== talkFilter) return false;
    return true;
  });

  const talkNames = Array.from(
    new Set(
      tasks
        .filter((t) => categoryFilter === "all" || t.category === categoryFilter)
        .map((t) => t.talkName)
        .filter((n): n is string => !!n),
    ),
  ).sort((a, b) => a.localeCompare(b, "ja"));

  const counts = {
    all: tasks.length,
    personal: tasks.filter((t) => t.type === "personal").length,
    org: tasks.filter((t) => t.type === "org").length,
  };

  const statusCounts: Record<string, number> = {
    overdue: tasks.filter((t) => t.status === "overdue").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    not_started: tasks.filter((t) => t.status === "not_started").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  const statusChips: { key: TaskStatus; label: string; active: string }[] = [
    { key: "overdue", label: "期日超過", active: "bg-rose-500 text-white border-rose-500" },
    { key: "in_progress", label: "進行中", active: "bg-blue-500 text-white border-blue-500" },
    { key: "not_started", label: "未着手", active: "bg-gray-500 text-white border-gray-500" },
    { key: "completed", label: "完了済み", active: "bg-emerald-500 text-white border-emerald-500" },
  ];

  const headTitle =
    categoryFilter !== "all" ? categoryFilter : tab === "personal" ? "個人タスク" : tab === "org" ? "組織タスク" : "すべてのタスク";

  return (
    <div className="h-screen flex flex-col bg-white text-gray-800">
      <div className="flex-1 flex min-h-0">
        {/* 左サイドバー */}
        <aside className="w-72 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col min-h-0">
          <div className="px-3 pt-3 pb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">タスク</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
            {/* 種別 */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">種別</p>
              <div className="space-y-0.5">
                {(["all", "personal", "org"] as const).map((t) => {
                  const labels = { all: "すべて", personal: "個人タスク", org: "組織タスク" };
                  const active = tab === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition ${
                        active ? "bg-white text-gray-900 font-semibold shadow-sm" : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <span>{labels[t]}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${active ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-600"}`}>
                        {counts[t]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ステータス */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">ステータス</p>
              <div className="flex flex-wrap gap-1.5">
                {statusChips.map((s) => {
                  const count = statusCounts[s.key];
                  const active = statusFilter === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => setStatusFilter(active ? "all" : s.key)}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
                        active ? s.active : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {s.label} {count}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* チャンネル */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">チャンネル</p>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => { setCategoryFilter("all"); setTalkFilter("all"); }}
                  className={`w-full text-left rounded-lg px-3 py-1.5 text-sm transition ${
                    categoryFilter === "all" ? "bg-white text-gray-900 font-semibold shadow-sm" : "text-gray-600 hover:bg-white"
                  }`}
                >
                  すべて
                </button>
                {categories.map((c) => {
                  const active = categoryFilter === c;
                  return (
                    <button
                      key={c}
                      onClick={() => { setCategoryFilter(active ? "all" : c); setTalkFilter("all"); }}
                      className={`w-full flex items-center gap-2 text-left rounded-lg px-3 py-1.5 text-sm transition ${
                        active ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <span className="text-gray-400">#</span>
                      <span className="truncate">{c}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* トークルーム（サブフィルター） */}
            {talkNames.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">トークルーム</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setTalkFilter("all")}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
                      talkFilter === "all" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    すべて
                  </button>
                  {talkNames.map((n) => {
                    const active = talkFilter === n;
                    return (
                      <button
                        key={n}
                        onClick={() => setTalkFilter(active ? "all" : n)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
                          active ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        # {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* フッターリンク */}
          <div className="px-3 py-3 border-t border-gray-200 flex flex-col gap-1">
            <Link href="/tasks/archive" className="text-xs text-gray-500 hover:text-gray-800 rounded-lg px-3 py-1.5 hover:bg-white transition">アーカイブ</Link>
            <Link href="/tasks/threads" className="text-xs text-gray-500 hover:text-gray-800 rounded-lg px-3 py-1.5 hover:bg-white transition">スレッド一覧</Link>
          </div>
        </aside>

        {/* 右メインペイン */}
        <main className="flex-1 min-w-0 bg-white flex flex-col min-h-0">
          <div className="flex-shrink-0 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-800 truncate">{headTitle}</h1>
              <p className="text-[11px] text-gray-500">{filtered.length}件のタスク</p>
            </div>
            <div className="flex items-center gap-2">
              {(statusFilter !== "all" || categoryFilter !== "all" || talkFilter !== "all") && (
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setCategoryFilter("all");
                    setTalkFilter("all");
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition"
                >
                  フィルター解除
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="max-w-3xl mx-auto">
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-base font-bold">タスクがありません</p>
                  <p className="text-sm mt-1">タスクはチームス（機能一覧 → チームス）のトークルーム内から作成します</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((t) => <TaskCard key={t.id} task={t} />)}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
