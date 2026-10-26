import EvaluationManager from "@/components/evaluations/EvaluationManager";
import { assertEvaluationAdmin, getEvaluationPageDataAction } from "@/lib/evaluationActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EvaluationsRoute() {
  const auth = await assertEvaluationAdmin();
  if (!auth.ok) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border p-10 text-center max-w-sm">
          <p className="text-sm text-gray-500">{auth.message}</p>
        </div>
      </div>
    );
  }

  const data = await getEvaluationPageDataAction();

  return (
    <EvaluationManager
      initialPeriods={data.periods}
      initialRecords={data.records}
      initialPeriodId={data.currentPeriodId}
      userName={auth.session.name}
    />
  );
}
