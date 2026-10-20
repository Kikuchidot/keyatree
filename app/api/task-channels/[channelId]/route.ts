import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/goalNavigatorStore";
import {
  getChannel,
  saveChannel,
  listTalks,
  type ChannelMember,
} from "@/lib/taskChannelStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ channelId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { channelId } = await ctx.params;
    const channel = await getChannel(channelId);
    if (!channel) {
      return NextResponse.json({ error: "チャンネルが見つかりません" }, { status: 404 });
    }
    const talks = await listTalks(channelId);
    return NextResponse.json({ channel, talks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { channelId } = await ctx.params;
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (session.permissionId !== "admin") {
      return NextResponse.json({ error: "チャンネルの編集は管理者のみ可能です" }, { status: 403 });
    }

    const channel = await getChannel(channelId);
    if (!channel) return NextResponse.json({ error: "チャンネルが見つかりません" }, { status: 404 });

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      archived?: boolean;
      addMembers?: { id: string; name: string; role?: "admin" | "member" }[];
      removeMemberId?: string;
    };

    const now = new Date().toISOString();
    if (typeof body.name === "string" && body.name.trim()) channel.name = body.name.trim();
    if (typeof body.description === "string") channel.description = body.description.trim() || undefined;
    if (typeof body.archived === "boolean") channel.archived = body.archived;

    if (body.addMembers) {
      for (const m of body.addMembers) {
        if (!m.id || channel.members.some((x) => x.id === m.id)) continue;
        const member: ChannelMember = { id: m.id, name: m.name, role: m.role ?? "member", joinedAt: now };
        channel.members.push(member);
      }
    }
    if (body.removeMemberId) {
      channel.members = channel.members.filter((m) => m.id !== body.removeMemberId);
    }

    const saved = await saveChannel(channel);
    return NextResponse.json({ channel: saved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { channelId } = await ctx.params;
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (session.permissionId !== "admin") {
      return NextResponse.json({ error: "チャンネルの削除は管理者のみ可能です" }, { status: 403 });
    }
    const channel = await getChannel(channelId);
    if (!channel) return NextResponse.json({ error: "チャンネルが見つかりません" }, { status: 404 });
    channel.archived = true;
    await saveChannel(channel);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
