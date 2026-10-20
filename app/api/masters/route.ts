import { NextResponse } from "next/server";
import { getMasters, saveMasters, type Masters } from "@/lib/mastersServerStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const masters = await getMasters();
    return NextResponse.json({ masters }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const masters = body?.masters as Masters | undefined;
    if (!masters || typeof masters !== "object") {
      return NextResponse.json({ error: "masters が不正です" }, { status: 400 });
    }
    await saveMasters(masters);
    return NextResponse.json({ ok: true, masters }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
