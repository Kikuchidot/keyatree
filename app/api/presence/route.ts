import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { getMasters } from "@/lib/mastersServerStore";
import { getPresenceMap, setPresence } from "@/lib/presenceStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 全ユーザーのアクティビティ現在値を返す（ログイン済みなら誰でも閲覧可） */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const presence = await getPresenceMap();
    return NextResponse.json({ presence }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** 自分のアクティビティを更新する（statusId はマスター activityStatus の項目ID、空文字で解除） */
export async function PUT(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = (await request.json()) as { statusId?: string };
    const statusId = (body.statusId ?? "").trim();

    if (statusId) {
      const masters = await getMasters();
      const valid = (masters.activityStatus ?? []).some((item) => item.id === statusId);
      if (!valid) {
        return NextResponse.json({ error: "不明なアクティビティです" }, { status: 400 });
      }
    }

    const accountId = session.id ?? session.employeeId ?? session.email;
    const presence = await setPresence(accountId, statusId);
    return NextResponse.json({ ok: true, presence }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
