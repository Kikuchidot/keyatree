import { canApprove, getServerSession } from "@/lib/goalNavigatorStore";
import { listStaff } from "@/lib/staffServerStore";
import { getApprovalAccess, getApprovalNavigatorRecords } from "@/lib/goalNavigatorActions";
import { getAssignedEmployeeIds } from "@/lib/goalAccess";
import Link from "next/link";
import GoalApprovalListPage from "./_components/GoalApprovalListPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function currentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function GoalNavigatorApprovalPage() {
  const session = await getServerSession();
  const isApprover = await getApprovalAccess();

  if (!isApprover) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p className="text-base font-bold text-gray-700">アクセス権限がありません</p>
            <p className="mt-2 text-sm text-gray-500">
              承認申請一覧は、管理者および担当承認者に割り当てられたアカウントのみ閲覧できます。
            </p>
            <Link
              href="/employees"
              className="mt-4 inline-flex rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              ホームへ戻る
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const [records, staff] = await Promise.all([
    getApprovalNavigatorRecords(),
    listStaff(),
  ]);
  const filterEmployeeIds = await getAssignedEmployeeIds(session);
  const scopedRecords =
    filterEmployeeIds.size > 0
      ? records.filter((r) => filterEmployeeIds.has(r.employeeId))
      : records;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-lg font-bold text-gray-800">目標設定・定性目標 承認申請一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            対象期間と提出ファイルを選択し、設定者ごとに申請を確認・承認してください。
            管理者以外は、自分が担当承認者として割り当てられた設定者のみが表示されます。
          </p>
          <div className="mt-4">
            <Link
              href="/approvals/goal-navigators/approved"
              className="inline-flex rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              承認済み一覧を見る
            </Link>
          </div>
        </div>

        <GoalApprovalListPage
          initialPeriod={currentPeriod()}
          initialStaff={staff.map((s) => ({
            id: s.id,
            name: s.name,
            photo: s.photo,
            team: s.team || s.department,
          }))}
          records={scopedRecords}
        />
      </main>
    </div>
  );
}
