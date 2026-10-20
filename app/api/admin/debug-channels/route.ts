import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const BUCKET = "task-channels";
const CHANNEL_PREFIX = "channels";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  if (secret !== process.env.DEBUG_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isSupabaseEnabled()) {
    return NextResponse.json({ supabaseEnabled: false, message: "Memory fallback active - no persistent data" });
  }

  const supabase = getSupabaseAdmin();

  // Ensure bucket
  const { data: bucketData } = await supabase.storage.getBucket(BUCKET);
  if (!bucketData) {
    return NextResponse.json({ supabaseEnabled: true, bucketExists: false });
  }

  // List all channel files
  const { data: files, error } = await supabase.storage.from(BUCKET).list(CHANNEL_PREFIX, { limit: 1000 });
  if (error) {
    return NextResponse.json({ supabaseEnabled: true, bucketExists: true, error: error.message });
  }

  const jsonFiles = (files ?? []).filter((f) => f.name.endsWith(".json"));

  // Download each channel JSON
  const channels: unknown[] = [];
  for (const f of jsonFiles) {
    const path = `${CHANNEL_PREFIX}/${f.name}`;
    const { data, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
    if (dlErr || !data) {
      channels.push({ file: f.name, error: dlErr?.message ?? "no data" });
      continue;
    }
    try {
      const parsed = JSON.parse(await data.text());
      channels.push({ file: f.name, ...parsed });
    } catch {
      channels.push({ file: f.name, error: "parse error" });
    }
  }

  return NextResponse.json({
    supabaseEnabled: true,
    bucketExists: true,
    totalFiles: jsonFiles.length,
    channels,
  });
}
