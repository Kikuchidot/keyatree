import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * 添付ファイルを Supabase Storage（chat-attachments バケット）にアップロードし、
 * 短い公開 URL を返す。
 *
 * - バケットはパブリックアクセス有効（共有リンクが認証不要でアクセス可能）
 * - ファイルパス: chat-attachments/{channelId}/{messageId}/{uuid}_{filename}
 * - Supabase 未設定時は何もせず元の data URL をそのまま返す（fallback）
 */

const ATTACHMENT_BUCKET = "chat-attachments";

let attachBucketReady = false;

async function ensureAttachmentBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (attachBucketReady) return;
  const { data } = await supabase.storage.getBucket(ATTACHMENT_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(ATTACHMENT_BUCKET, { public: true });
    if (error && !/exist/i.test(error.message)) {
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

/** data URL を Buffer に変換し、content-type を返す */
function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) return null;
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
  messageId: string,
): Promise<AttachmentOutput[]> {
  if (!isSupabaseEnabled() || attachments.length === 0) {
    return attachments;
  }

  const supabase = getSupabaseAdmin();
  try {
    await ensureAttachmentBucket(supabase);
  } catch {
    // バケット作成失敗 → fallback
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
      // パース失敗 → そのまま保持
      results.push(att);
      continue;
    }

    const uuid = newUUID();
    const safeName = sanitizeFilename(att.name);
    const storagePath = `${channelId}/${messageId}/${uuid}_${safeName}`;

    try {
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, parsed.buffer, {
          contentType: parsed.contentType,
          upsert: false,
        });

      if (error) {
        // アップロード失敗 → fallback
        results.push(att);
        continue;
      }

      // 公開 URL を取得
      const { data: urlData } = supabase.storage
        .from(ATTACHMENT_BUCKET)
        .getPublicUrl(storagePath);

      results.push({
        name: att.name,
        dataUrl: urlData.publicUrl,
        type: att.type,
        size: att.size,
      });
    } catch {
      // エラー → fallback
      results.push(att);
    }
  }

  return results;
}
