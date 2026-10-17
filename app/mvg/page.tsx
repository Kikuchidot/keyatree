import MvgVotePage from "@/components/mvg/MvgVotePage";
import { getMvgStaffForVotingAction } from "@/lib/mvgActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MvgPage() {
  const currentYear = new Date().getFullYear().toString();
  const res = await getMvgStaffForVotingAction(currentYear);

  if (!res.ok) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-10 text-center max-w-sm">
          <p className="text-sm text-gray-500">{res.message}</p>
        </div>
      </div>
    );
  }

  return (
    <MvgVotePage
      initialPeriod={currentYear}
      initialStaff={res.staff}
      initialPeriods={res.periods}
    />
  );
}
