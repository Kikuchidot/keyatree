import { NextResponse } from "next/server";
import {
  listNavigatorRecords,
  getServerSession,
} from "@/lib/goalNavigatorStore";
import { isGoalAdmin } from "@/lib/goalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name") || "";
    const employeeId = searchParams.get("employeeId") || "";
    const kind = searchParams.get("kind") || "quantitative";

    const session = await getServerSession();
    const debugSecret = process.env.DEBUG_SECRET;
    const headerSecret = request.headers.get("x-debug-secret");
    const isDebugAuth = !!debugSecret && debugSecret === headerSecret;
    if (!isGoalAdmin(session) && !isDebugAuth) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const all = await listNavigatorRecords({ includeAll: true });
    const records = all.filter((r) => {
      if (r.kind !== kind) return false;
      if (employeeId) {
        return r.employeeId === employeeId || r.ownerId === employeeId;
      }
      if (name) {
        return (r.employeeName || "").includes(name);
      }
      return false;
    });

    const summary = records
      .sort(
        (a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        submittedAt: r.submittedAt,
        approvedAt: r.approvedAt,
        entryDate: r.answers?.entry_date || null,
        answerKeys: Object.keys(r.answers || {}),
        sampleAnswers: Object.fromEntries(
          Object.entries(r.answers || {})
            .filter(([k]) => {
              return ["company_item", "target1", "target2", "target3"].some((p) =>
                k.startsWith(p)
              );
            })
            .slice(0, 20)
        ),
      }));

    return NextResponse.json({ count: summary.length, records: summary });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
