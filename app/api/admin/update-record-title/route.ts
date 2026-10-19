import { NextResponse } from "next/server";
import {
  getNavigatorRecordById,
  upsertNavigatorRecord,
  getServerSession,
} from "@/lib/goalNavigatorStore";
import { isGoalAdmin } from "@/lib/goalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recordId, title } = body;

    if (!recordId || typeof title !== "string") {
      return NextResponse.json(
        { error: "recordId and title are required" },
        { status: 400 }
      );
    }

    const session = await getServerSession();
    const debugSecret = process.env.DEBUG_SECRET;
    const headerSecret = request.headers.get("x-debug-secret");
    const isDebugAuth = !!debugSecret && debugSecret === headerSecret;
    if (!isGoalAdmin(session) && !isDebugAuth) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const existing = await getNavigatorRecordById(recordId);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const updated = await upsertNavigatorRecord({
      id: existing.id,
      ownerId: existing.ownerId,
      kind: existing.kind,
      employeeId: existing.employeeId,
      employeeName: existing.employeeName,
      department: existing.department,
      title,
      status: existing.status,
      answers: existing.answers,
      actor: { actorId: "debug", actorName: "debug" },
    });

    return NextResponse.json({ ok: true, record: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
