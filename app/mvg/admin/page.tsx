import MvgAdminPage from "@/components/mvg/MvgAdminPage";
import { assertMvgAdmin } from "@/lib/mvgActions";
import { listStaff } from "@/lib/staffServerStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MvgAdminRoute() {
  const auth = await assertMvgAdmin();
  if (!auth.ok) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-10 text-center max-w-sm">
          <p className="text-sm text-gray-500">{auth.message}</p>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear().toString();
  const staff = await listStaff();

  return (
    <MvgAdminPage
      initialPeriod={currentYear}
      initialStaff={staff.map((s) => ({
        id: s.id,
        name: s.name,
        photo: s.photo,
        team: s.team || s.department,
      }))}
    />
  );
}
