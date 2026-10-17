import RecordStatusBadge from "@/components/goal-navigator/RecordStatusBadge";
import { getApprovalAccess, getApprovalNavigatorRecords } from "@/lib/goalNavigatorActions";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { getAssignedEmployeeIds } from "@/lib/goalAccess";
import Link from "next/link";
import GroupedPendingApprovals from "./_components/GroupedPendingApprovals";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const records = await getApprovalNavigatorRecords();
  const filterEmployeeIds = await getAssignedEmployeeIds(session);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-lg font-bold text-gray-800">目標設定・定性目標 承認申請一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            提出者ごとにタブでまとめています。「進行中」と「終了済み」を切り替えられます。
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

        <GroupedPendingApprovals records={records} filterEmployeeIds={filterEmployeeIds} />
      </main>
    </div>
  );
}
