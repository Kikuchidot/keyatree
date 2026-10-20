import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import {
  listChannels,
  listArchivedChannels,
  createChannel,
  seedChannels,
  type ChannelMember,
} from "@/lib/taskChannelStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await seedChannels();
    const channels = await listChannels();
    const archivedChannels = await listArchivedChannels();
    return NextResponse.json({ channels, archivedChannels });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.permissionId !== "admin") {
      return NextResponse.json({ error: "チャンネルの作成は管理者のみ可能です" }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      members?: { id: string; name: string; role?: "admin" | "member" }[];
    };
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "チャンネル名を入力してください" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const creatorId = session.employeeId || session.id || "";
    const members: ChannelMember[] = [];
    // 作成者を管理者として必ず含める
    if (creatorId) {
      members.push({ id: creatorId, name: session.name, role: "admin", joinedAt: now });
    }
    for (const m of body.members ?? []) {
      if (!m.id || members.some((x) => x.id === m.id)) continue;
      members.push({ id: m.id, name: m.name, role: m.role ?? "member", joinedAt: now });
    }

    const channel = await createChannel({
      name,
      description: body.description?.trim() || undefined,
      members,
      createdBy: creatorId,
    });
    return NextResponse.json({ channel });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
