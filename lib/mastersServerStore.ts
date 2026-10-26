import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * マスター管理（所属チーム/役職/ステージ/雇用形態/ブランク）の選択肢を
 * Supabase Storage に単一 JSON として永続化する。staff と同じバケット方式。
 * env 未設定時はメモリfallback（開発用）。全端末・全アカウント共有。
 */

export type MasterItem = { id: string; label: string; order: number };
export type Masters = Record<string, MasterItem[]>;

const BUCKET = "staff";
const MASTERS_PATH = "masters/all.json";

/**
 * 保存ファイルの形式。
 * seedVersion は「既定値に後から追加した項目を既存データへ補完した版数」で、
 * 補完は一度だけ行い、以後はユーザーによる削除・リネームを尊重する。
 */
type MastersFile = { seedVersion: number; masters: Masters };

/** 既定値に後から追加した項目（既存データへ一度だけ補完する）。key -> id -> 追加時の版数 */
const LATER_DEFAULT_ITEMS: Record<string, Record<string, number>> = {
  employmentType: { e5: 2 }, // 退職
};

const CURRENT_SEED_VERSION = 2;

// ---- 初期マスターデータ（未登録時に seed） ----
export const defaultMasters: Masters = {
  department: [
    { id: "d1", label: "クライアントマネジメントチーム", order: 1 },
    { id: "d2", label: "リーシングチーム", order: 2 },
    { id: "d3", label: "カスタマーサポートチーム", order: 3 },
    { id: "d4", label: "カスタマーオペレーションチーム", order: 4 },
    { id: "d5", label: "マーケティングチーム", order: 5 },
    { id: "d6", label: "アカウントチーム", order: 6 },
    { id: "d7", label: "リーシングアシスタントチーム", order: 7 },
  ],
  position: [
    { id: "p1", label: "代表取締役", order: 1 },
    { id: "p2", label: "部長", order: 2 },
    { id: "p3", label: "課長", order: 3 },
    { id: "p4", label: "主任", order: 4 },
    { id: "p5", label: "担当者", order: 5 },
  ],
  grade: [
    { id: "g1", label: "E1", order: 1 },
    { id: "g2", label: "E2", order: 2 },
    { id: "g3", label: "J1", order: 3 },
    { id: "g4", label: "J2", order: 4 },
    { id: "g5", label: "J3", order: 5 },
    { id: "g6", label: "S1", order: 6 },
    { id: "g7", label: "S2", order: 7 },
    { id: "g8", label: "S3", order: 8 },
    { id: "g9", label: "L1", order: 9 },
    { id: "g10", label: "L2", order: 10 },
    { id: "g11", label: "M1", order: 11 },
    { id: "g12", label: "M2", order: 12 },
    { id: "g13", label: "M3", order: 13 },
  ],
  jobType: [
    { id: "j1", label: "営業", order: 1 },
    { id: "j2", label: "管理", order: 2 },
    { id: "j3", label: "物件管理", order: 3 },
    { id: "j4", label: "経営", order: 4 },
    { id: "j5", label: "経理", order: 5 },
    { id: "j6", label: "マーケティング", order: 6 },
  ],
  employmentType: [
    { id: "e1", label: "正社員", order: 1 },
    { id: "e2", label: "契約社員", order: 2 },
    { id: "e3", label: "パートタイム", order: 3 },
    { id: "e4", label: "アルバイト", order: 4 },
    { id: "e5", label: "退職", order: 5 },
  ],
  evaluationRank: [
    { id: "r1", label: "S", order: 1 },
    { id: "r2", label: "A", order: 2 },
    { id: "r3", label: "B", order: 3 },
    { id: "r4", label: "C", order: 4 },
    { id: "r5", label: "D", order: 5 },
    { id: "r6", label: "E", order: 6 },
  ],
  activityStatus: [
    { id: "as1", label: "対応可能", order: 1 },
    { id: "as2", label: "取り込み中", order: 2 },
    { id: "as3", label: "応答不可", order: 3 },
    { id: "as4", label: "一時退席", order: 4 },
    { id: "as5", label: "離席中", order: 5 },
    { id: "as6", label: "オフライン表示", order: 6 },
  ],
  blank: [],
};

// ---- In-memory fallback ----
const g = globalThis as unknown as { __keyatreeMastersStore?: Masters };

// ---- Storage helpers ----
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

/**
 * 保存データを読み込む。旧形式（Masters が直接保存された JSON）は
 * 新形式（{ seedVersion, masters }）へ一度だけマイグレーションする。
 * ファイルが存在しない場合は null を返す。
 */
async function downloadMastersFile(): Promise<MastersFile | null> {
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const { data, error } = await supabase.storage.from(BUCKET).download(MASTERS_PATH);
  if (error || !data) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await data.text());
  } catch {
    return null;
  }
  // 新形式
  if (
    parsed &&
    typeof parsed === "object" &&
    typeof (parsed as MastersFile).seedVersion === "number" &&
    (parsed as MastersFile).masters &&
    typeof (parsed as MastersFile).masters === "object"
  ) {
    const file = parsed as MastersFile;
    return { seedVersion: file.seedVersion, masters: file.masters };
  }
  // 旧形式（Masters が直接保存されている）
  return { seedVersion: 1, masters: parsed as Masters };
}

export async function getMasters(): Promise<Masters> {
  if (!isSupabaseEnabled()) {
    const current = g.__keyatreeMastersStore;
    if (!current) return defaultMasters;
    // Supabase 版と同じく、後から追加したマスターキーは既定値で補完する
    const { masters } = migrateMastersFile({ seedVersion: CURRENT_SEED_VERSION, masters: current });
    g.__keyatreeMastersStore = masters;
    return masters;
  }
  let file = await downloadMastersFile();
  if (!file) {
    // 未登録なら初期値を保存して返す
    file = { seedVersion: CURRENT_SEED_VERSION, masters: { ...defaultMasters } };
  }
  const { masters: merged, changed } = migrateMastersFile(file);
  if (file.seedVersion < CURRENT_SEED_VERSION || changed) {
    await saveMastersFile({ seedVersion: CURRENT_SEED_VERSION, masters: merged });
  }
  return merged;
}

/**
 * 保存データに対するマイグレーション（純粋関数）。
 *
 * - seedVersion が古い場合のみ、旧マージ処理が自動復活させていたゴースト項目
 *   （id が "_auto" で終わるもの）を除去する。ユーザーが追加した項目の id は
 *   `${key}_${timestamp}` 形式なので誤って消えることはない。
 * - 後から追加したマスターキーは既定値で補完する（丸ごと存在しない場合のみ）。
 * - 既定値に後から追加した項目（例: 雇用形態の「退職」）は一度だけ補完する。
 *   ユーザーが削除・リネームした既存項目を復活させることはしない。
 */
export function migrateMastersFile(file: MastersFile): { masters: Masters; changed: boolean } {
  let masters = file.masters;
  let changed = false;

  if (file.seedVersion < CURRENT_SEED_VERSION) {
    for (const key of Object.keys(masters)) {
      const items = masters[key] ?? [];
      const cleaned = items.filter((item) => !item.id.endsWith("_auto"));
      if (cleaned.length !== items.length) {
        masters = { ...masters, [key]: cleaned };
        changed = true;
      }
    }
  }

  const merged: Masters = { ...masters };
  for (const key of Object.keys(defaultMasters)) {
    if (!Array.isArray(merged[key])) {
      merged[key] = defaultMasters[key];
      changed = true;
    }
  }

  for (const [key, later] of Object.entries(LATER_DEFAULT_ITEMS)) {
    for (const [id, since] of Object.entries(later)) {
      if (since <= file.seedVersion) continue;
      const def = defaultMasters[key]?.find((x) => x.id === id);
      if (!def) continue;
      const labels = new Set((merged[key] ?? []).map((item) => item.label));
      if (!labels.has(def.label)) {
        merged[key] = [...(merged[key] ?? []), { ...def }];
        changed = true;
      }
    }
  }

  return { masters: merged, changed };
}

/** メモリfallback・Supabase 共通の保存処理（新形式で書き込む） */
async function saveMastersFile(file: MastersFile): Promise<void> {
  if (!isSupabaseEnabled()) {
    g.__keyatreeMastersStore = file.masters;
    return;
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(MASTERS_PATH, blob, {
    contentType: "application/json",
    cacheControl: "no-cache",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

export async function saveMasters(masters: Masters): Promise<void> {
  await saveMastersFile({ seedVersion: CURRENT_SEED_VERSION, masters });
}
