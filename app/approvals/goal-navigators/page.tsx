import { canApprove, getServerSession } from "@/lib/goalNavigatorStore";
import { listStaff } from "@/lib/staffServerStore";
import { getApprovalAccess } from "@/lib/goalNavigatorActions";
import { getAssignedEmployeeIds, isGoalAdmin } from "@/lib/goalAccess";
import Link from "next/link";
import GoalApprovalsPage from "./_components/GoalApprovalsPage";

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

  const isAdmin = isGoalAdmin(session);
  const staff = await listStaff();
  const assignedIds = await getAssignedEmployeeIds(session);
  const visibleStaff = isAdmin
    ? staff
    : staff.filter((s) => assignedIds.has(s.id));

  return (
    <GoalApprovalsPage
      initialPeriod={currentPeriod()}
      initialStaff={visibleStaff.map((s) => ({
        id: s.id,
        name: s.name,
        photo: s.photo,
        team: s.team || s.department,
      }))}
      isAdmin={isAdmin}
      myEmployeeId={session?.employeeId}
    />
  );
}
