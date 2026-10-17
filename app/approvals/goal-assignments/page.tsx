import { canApprove, getServerSession } from "@/lib/goalNavigatorStore";
import { listStaff } from "@/lib/staffServerStore";
import GoalAssignmentsPage from "./_components/GoalAssignmentsPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function currentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function GoalAssignmentsRoute() {
  const session = await getServerSession();
  if (!canApprove(session)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-10 text-center max-w-sm">
          <p className="text-sm text-gray-500">
            この画面は管理者・人事管理者のみ閲覧できます。
          </p>
        </div>
      </div>
    );
  }

  const staff = await listStaff();

  return (
    <GoalAssignmentsPage
      initialPeriod={currentPeriod()}
      initialStaff={staff.map((s) => ({
        id: s.id,
        name: s.name,
        photo: s.photo,
        team: s.team || s.department,
      }))}
    />
  );
}
