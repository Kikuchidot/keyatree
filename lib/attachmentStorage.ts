import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * 添付ファイルを Supabase Storage（chat-attachments バケット）にアップロードし、
 * 短い公開 URL を返す。
 *
 * - バケットはパブリックアクセス有効（共有リンクが認証不要でアクセス可能）
 * - ファイルパス: chat-attachments/{channelId}/{talkId}/{uuid}_{filename}
 * - Supabase 未設定時は何もせず元の data URL をそのまま返す（fallback）
 */

const ATTACHMENT_BUCKET = "chat-attachments";

let attachBucketReady = false;

async function ensureAttachmentBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (attachBucketReady) return;
  const { data, error: getErr } = await supabase.storage.getBucket(ATTACHMENT_BUCKET);
  if (getErr) {
    console.warn(`[attachmentStorage] getBucket error: ${getErr.message}`);
  }
  if (!data) {
    console.log(`[attachmentStorage] Creating bucket "${ATTACHMENT_BUCKET}" (public: true)`);
    const { error } = await supabase.storage.createBucket(ATTACHMENT_BUCKET, { public: true });
    if (error && !/exist/i.test(error.message)) {
      console.error(`[attachmentStorage] createBucket failed: ${error.message}`);
      throw new Error(`chat-attachments バケット作成に失敗: ${error.message}`);
    }
  }
  attachBucketReady = true;
}

function newUUID(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
}

/**
 * data URL を Buffer に変換し、content-type を返す。
 * data:image/png;base64,... や data:text/plain;charset=utf-8;base64,... など
 * 追加パラメータ付きの形式にも対応。
 */
function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  // data:MIME[;param=val]*;base64,DATA
  const match = dataUrl.match(/^data:([^;,]+)[^,]*;base64,([\s\S]+)$/);
  if (!match) {
    console.warn(`[attachmentStorage] parseDataUrl failed for prefix: ${dataUrl.slice(0, 80)}`);
    return null;
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

/** ファイル名をサニタイズ（Storage パス安全） */
function sanitizeFilename(name?: string): string {
  if (!name) return "file";
  return name.replace(/[^a-zA-Z0-9._\-\u3000-\u9FFF\uF900-\uFAFF]/g, "_").slice(0, 120);
}

export type AttachmentInput = {
  name?: string;
  dataUrl: string;
  type?: string;
  size?: number;
};

export type AttachmentOutput = {
  name?: string;
  dataUrl: string; // Storage URL or original data URL (fallback)
  type?: string;
  size?: number;
};

/**
 * 添付ファイル配列を Supabase Storage にアップロードし、
 * dataUrl を公開 URL に差し替えて返す。
 *
 * Supabase 未設定時・アップロード失敗時は元の data URL をそのまま返す。
 */
export async function uploadAttachments(
  attachments: AttachmentInput[],
  channelId: string,
  talkId: string,
): Promise<AttachmentOutput[]> {
  if (attachments.length === 0) {
    return attachments;
  }

  if (!isSupabaseEnabled()) {
    console.warn("[attachmentStorage] Supabase not enabled, falling back to data URLs");
    return attachments;
  }

  const supabase = getSupabaseAdmin();
  try {
    await ensureAttachmentBucket(supabase);
  } catch (err) {
    console.error("[attachmentStorage] ensureAttachmentBucket failed:", err);
    return attachments;
  }

  const results: AttachmentOutput[] = [];

  for (const att of attachments) {
    // 既に URL の場合（再送防止）はそのまま
    if (!att.dataUrl.startsWith("data:")) {
      results.push(att);
      continue;
    }

    const parsed = parseDataUrl(att.dataUrl);
    if (!parsed) {
      results.push(att);
      continue;
    }

    const uuid = newUUID();
    const safeName = sanitizeFilename(att.name);
    const storagePath = `${channelId}/${talkId}/${uuid}_${safeName}`;

    try {
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, parsed.buffer, {
          contentType: parsed.contentType,
          upsert: false,
        });

      if (error) {
        console.error(`[attachmentStorage] upload failed for ${safeName}: ${error.message}`);
        results.push(att);
        continue;
      }

      // 公開 URL を取得
      const { data: urlData } = supabase.storage
        .from(ATTACHMENT_BUCKET)
        .getPublicUrl(storagePath);

      console.log(`[attachmentStorage] uploaded: ${storagePath} → ${urlData.publicUrl.slice(0, 100)}`);
      results.push({
        name: att.name,
        dataUrl: urlData.publicUrl,
        type: att.type,
        size: att.size,
      });
    } catch (err) {
      console.error(`[attachmentStorage] unexpected error for ${safeName}:`, err);
      results.push(att);
    }
  }

  return results;
}
