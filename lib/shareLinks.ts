import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * 共有リンク短縮機能
 *
 * 添付ファイルの長い Supabase Storage URL を短い ID にマッピングし、
 * /api/share/{shortId} でアクセスできるようにする。
 *
 * マッピングは Supabase Storage (shared-links バケット) に JSON で保存。
 */

const BUCKET = "shared-links";

let bucketReady = false;

async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !/exist/i.test(error.message)) {
      throw new Error(`shared-links バケット作成に失敗: ${error.message}`);
    }
  }
  bucketReady = true;
}

/** 8文字の URL-safe ランダム ID */
function generateShortId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export type SharedLink = {
  id: string;
  url: string;         // 元の Supabase Storage URL
  name?: string;       // ファイル名
  type?: string;       // MIME type
  createdAt: string;
};

/**
 * 共有リンクを作成し、短い ID を返す。
 */
export async function createSharedLink(input: {
  url: string;
  name?: string;
  type?: string;
}): Promise<string | null> {
  if (!isSupabaseEnabled()) return null;

  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);

  const id = generateShortId();
  const link: SharedLink = {
    id,
    url: input.url,
    name: input.name,
    type: input.type,
    createdAt: new Date().toISOString(),
  };

  const path = `${id}.json`;
  const { error } = await supabase.storage.from(BUCKET).upload(
    path,
    JSON.stringify(link),
    { contentType: "application/json", upsert: false },
  );
  if (error) {
    console.error(`[shareLinks] create failed: ${error.message}`);
    return null;
  }

  return id;
}

/**
 * 短い ID から共有リンク情報を取得する。
 */
export async function getSharedLink(id: string): Promise<SharedLink | null> {
  if (!isSupabaseEnabled()) return null;
  // IDのバリデーション（英数字のみ、最大16文字）
  if (!/^[A-Za-z0-9]{1,16}$/.test(id)) return null;

  const supabase = getSupabaseAdmin();
  try {
    await ensureBucket(supabase);
  } catch {
    return null;
  }

  const path = `${id}.json`;
  const cacheBuster = `?t=${Date.now()}`;
  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  if (!bucket) return null;

  // shared-links は private バケットなので、createSignedUrl を使う
  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60); // 60秒有効
  if (error || !signed?.signedUrl) return null;

  try {
    const res = await fetch(signed.signedUrl + cacheBuster, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json as SharedLink;
  } catch {
    return null;
  }
}
