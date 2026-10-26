import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * アクティビティ（在席状況）の現在値をアカウントごとに保存する。
 * 選択肢の定義はマスター管理（activityStatus カテゴリ）で行い、
 * ここにはアカウントID -> 選択したマスター項目ID の対応だけを保存する。
 * masters と同じ Supabase Storage JSON 方式。env 未設定時はメモリfallback。
 */

export type PresenceMap = Record<string, { statusId: string; updatedAt: string }>;

const BUCKET = "staff";
const PRESENCE_PATH = "presence/all.json";

// ---- In-memory fallback ----
const g = globalThis as unknown as { __keyatreePresence?: PresenceMap };

let bucketReady = false;
async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !/exist/i.test(error.message)) {
      throw new Error(`bucket作成に失敗: ${error.message}`);
    }
  }
  bucketReady = true;
}

export async function getPresenceMap(): Promise<PresenceMap> {
  if (!isSupabaseEnabled()) {
    return g.__keyatreePresence ?? {};
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const { data, error } = await supabase.storage.from(BUCKET).download(PRESENCE_PATH);
  if (error || !data) return {};
  try {
    const parsed = JSON.parse(await data.text());
    if (parsed && typeof parsed === "object") return parsed as PresenceMap;
  } catch {
    /* 壊れたJSONは空扱い */
  }
  return {};
}

export async function setPresence(accountId: string, statusId: string): Promise<PresenceMap> {
  const map = await getPresenceMap();
  if (statusId) {
    map[accountId] = { statusId, updatedAt: new Date().toISOString() };
  } else {
    delete map[accountId];
  }
  if (!isSupabaseEnabled()) {
    g.__keyatreePresence = map;
    return map;
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const blob = new Blob([JSON.stringify(map)], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(PRESENCE_PATH, blob, {
    contentType: "application/json",
    cacheControl: "no-cache",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return map;
}
