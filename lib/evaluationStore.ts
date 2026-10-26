import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * 人事評価の永続化層。Supabase Storage バケットJSON方式
 * （mvgEventStore / goalNavigatorStore と同じパターン）。env 未設定時はメモリfallback。
 */

export type EvaluationPeriod = {
  id: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  label: string;
  /** 例: ["2026-07", "2026-08", "2026-09"] */
  months: string[];
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
};

export type QualItem = {
  label: string;
  /** 月（"2026-07"） → 点数（0〜10） */
  monthlyScores: Record<string, number>;
};

export type EvaluationRecord = {
  id: string;
  periodId: string;
  employeeId: string;
  employeeName: string;
  teamCode: string;
  teamLabel: string;
  stageGrade: string;
  /** 現状号俸 */
  currentGokyu: number;
  /** ①現状基本給 */
  currentSalary: number;
  quantitative: {
    companyTarget: number;
    companyResult: number;
    otherTarget: number;
    otherResult: number;
    /** 自動取込元の定量目標シートrecordId */
    sourceRecordIds: string[];
  };
  qualitative: QualItem[];
  /** 手動調整額（③-②） */
  adjustment: number;
  status: "draft" | "confirmed";
  /** ③確定基本給（確定時のみ） */
  finalSalary?: number;
  confirmedAt?: string;
  confirmedBy?: string;
  createdAt: string;
  updatedAt: string;
};

const BUCKET = "evaluations";
const PERIOD_PREFIX = "periods/";
const RECORD_PREFIX = "records/";

function periodPath(id: string) {
  return `${PERIOD_PREFIX}${id}.json`;
}
function recordPath(id: string) {
  return `${RECORD_PREFIX}${id}.json`;
}

async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

async function getJson<T>(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  path: string
): Promise<T | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const text = await data.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function putJson(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  path: string,
  value: unknown
) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: "application/json",
  });
}

async function listJson<T>(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  prefix: string
): Promise<T[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 5000 });
  if (error) return [];
  const files = (data || []).filter((f) => f.name.endsWith(".json"));
  const parsed = await Promise.all(
    files.map((f) => getJson<T>(supabase, `${prefix}${f.name}`))
  );
  const result: T[] = [];
  for (const v of parsed) {
    if (v !== null) result.push(v as T);
  }
  return result;
}

// ---- In-memory fallback ----
function getMemoryStore<T>(key: string): T[] {
  const g = globalThis as unknown as Record<string, unknown>;
  const k = `__keyatree_eval_${key}__`;
  if (!Array.isArray(g[k])) g[k] = [];
  return g[k] as T[];
}

// ---- Periods ----

export function monthsForQuarter(year: number, quarter: 1 | 2 | 3 | 4): string[] {
  const startMonth = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map((i) => {
    const m = startMonth + i;
    return `${year}-${String(m).padStart(2, "0")}`;
  });
}

export async function listEvaluationPeriods(): Promise<EvaluationPeriod[]> {
  let periods: EvaluationPeriod[];
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    periods = await listJson<EvaluationPeriod>(supabase, PERIOD_PREFIX);
  } else {
    periods = getMemoryStore<EvaluationPeriod>("periods");
  }
  return periods.sort(
    (a, b) => b.year - a.year || b.quarter - a.quarter
  );
}

export async function getEvaluationPeriod(id: string): Promise<EvaluationPeriod | null> {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    return await getJson<EvaluationPeriod>(supabase, periodPath(id));
  }
  return getMemoryStore<EvaluationPeriod>("periods").find((p) => p.id === id) ?? null;
}

export async function findEvaluationPeriod(
  year: number,
  quarter: 1 | 2 | 3 | 4
): Promise<EvaluationPeriod | null> {
  const periods = await listEvaluationPeriods();
  return periods.find((p) => p.year === year && p.quarter === quarter) ?? null;
}

export async function saveEvaluationPeriod(input: {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}): Promise<EvaluationPeriod> {
  const now = new Date().toISOString();
  const id = `${input.year}-q${input.quarter}`;
  const existing = await getEvaluationPeriod(id);
  const period: EvaluationPeriod = existing
    ? { ...existing, updatedAt: now }
    : {
        id,
        year: input.year,
        quarter: input.quarter,
        label: `${input.year} 第${input.quarter}四半期`,
        months: monthsForQuarter(input.year, input.quarter),
        status: "open",
        createdAt: now,
        updatedAt: now,
      };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await putJson(supabase, periodPath(id), period);
  } else {
    const store = getMemoryStore<EvaluationPeriod>("periods");
    const idx = store.findIndex((p) => p.id === id);
    if (idx >= 0) store[idx] = period;
    else store.push(period);
  }
  return period;
}

// ---- Records ----

export async function listEvaluationRecords(periodId?: string): Promise<EvaluationRecord[]> {
  let records: EvaluationRecord[];
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    records = await listJson<EvaluationRecord>(supabase, RECORD_PREFIX);
  } else {
    records = getMemoryStore<EvaluationRecord>("records");
  }
  const filtered = periodId ? records.filter((r) => r.periodId === periodId) : records;
  return filtered.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "ja"));
}

export async function getEvaluationRecord(id: string): Promise<EvaluationRecord | null> {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    return await getJson<EvaluationRecord>(supabase, recordPath(id));
  }
  return getMemoryStore<EvaluationRecord>("records").find((r) => r.id === id) ?? null;
}

export async function saveEvaluationRecord(record: EvaluationRecord): Promise<EvaluationRecord> {
  const next = { ...record, updatedAt: new Date().toISOString() };
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await putJson(supabase, recordPath(next.id), next);
  } else {
    const store = getMemoryStore<EvaluationRecord>("records");
    const idx = store.findIndex((r) => r.id === next.id);
    if (idx >= 0) store[idx] = next;
    else store.push(next);
  }
  return next;
}

export async function upsertEvaluationRecords(
  records: EvaluationRecord[]
): Promise<EvaluationRecord[]> {
  await Promise.all(records.map((r) => saveEvaluationRecord(r)));
  return records;
}
