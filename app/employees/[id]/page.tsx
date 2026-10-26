"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getEmployee, Employee, normalizeEmployee } from "@/lib/mockData";
import EmployeeCard from "@/components/EmployeeCard";
import GreetingBanner from "@/components/GreetingBanner";
import NewsTicker from "@/components/NewsTicker";
import TaskAlertPanel from "@/components/TaskAlertPanel";
import ChatUnreadPanel from "@/components/tasks/ChatUnreadPanel";
import MonthlyGoalCard from "@/components/MonthlyGoalCard";
import BravoButton from "@/components/BravoButton";
import SeedGoalData from "@/components/goal-navigator/SeedGoalData";
import EmployeeMvgHistory from "@/components/mvg/EmployeeMvgHistory";
import ApprovalNoticePanel from "@/components/goal-navigator/ApprovalNoticePanel";

type SessionInfo = {
  id?: string;
  employeeId?: string;
  permissionId?: string;
  name?: string;
};

function parseCookieSession(): SessionInfo | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/kt_session=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as SessionInfo;
  } catch {
    return null;
  }
}

export default function EmployeePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [employee, setEmployee] = useState<Employee | null | undefined>(undefined);
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined);

  useEffect(() => {
    setSession(parseCookieSession());
  }, []);

  // 本人（employeeId が一致）または管理者のみ閲覧可
  const authorized = useMemo(() => {
    if (session === undefined) return undefined; // 判定前
    if (!session) return false;
    if (session.permissionId === "admin") return true;
    return !!session.employeeId && session.employeeId === id;
  }, [session, id]);

  useEffect(() => {
    if (!authorized) return; // 未認可のときはデータ取得しない
    // 静的データを優先。無ければ Supabase から取得
    const staticEmp = getEmployee(id);
    if (staticEmp) {
      setEmployee(staticEmp);
      return;
    }
    fetch(`/api/staff/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) =>
        setEmployee(data?.staff ? normalizeEmployee(data.staff) : null)
      )
      .catch(() => setEmployee(null));
  }, [id, authorized]);

  // アクセス制御判定中
  if (authorized === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // 本人・管理者以外はアクセス不可
  if (!authorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-10 text-center max-w-sm w-full mx-4">
          <p className="text-2xl font-black text-gray-700 mb-2">閲覧権限がありません</p>
          <p className="text-sm text-gray-500 mb-6">
            このスタッフ詳細ページは、ご本人または管理者のみが閲覧できます。
          </p>
          <Link
            href="/employees"
            className="inline-block text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl transition"
          >
            スタッフ一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (employee === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (employee === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-10 text-center max-w-sm w-full mx-4">
          <p className="text-2xl font-black text-gray-700 mb-2">スタッフが見つかりません</p>
          <p className="text-sm text-gray-500 mb-6">指定されたスタッフは存在しないか、削除された可能性があります。</p>
          <Link href="/employees" className="inline-block text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl transition">
            スタッフ一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* グリーティングバナー */}
      <GreetingBanner employee={employee} />

      {/* 社内通知ティッカー */}
      <NewsTicker />

      {/* タスクアラートパネル */}
      <TaskAlertPanel />

      {/* チャット未読パネル（未読があるときのみ表示） */}
      <ChatUnreadPanel />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row gap-6">

          {/* 左サイドバー */}
          <aside className="md:w-64 flex-shrink-0 space-y-4">
            {/* プロフィールカード */}
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <EmployeeCard employee={employee} />
              <div className="px-5 pb-5">
                <BravoButton
                  employeeId={employee.id}
                  initialCount={employee.monthlyGoal.cheers}
                />
              </div>
            </div>

          </aside>

          {/* メインコンテンツ */}
          <div className="flex-1 space-y-5">

            {/* 承認依頼の通知 */}
            <ApprovalNoticePanel employeeId={id} />

            {/* 今月の目標 */}
            <MonthlyGoalCard
              employeeId={employee.id}
              monthlyGoal={employee.monthlyGoal}
              employeeName={employee.name}
            />

            {/* 承認済み目標 進捗リマインド */}
            <SeedGoalData employeeId={id} />

            {/* MVG 受賞履歴 */}
            <EmployeeMvgHistory employeeId={id} />

          </div>
        </div>
      </main>
    </div>
  );
}
