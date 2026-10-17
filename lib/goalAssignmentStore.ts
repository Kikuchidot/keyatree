import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * 目標設定シートの承認者割り当て。
 * 対象期間（例: 2026-09）ごとに全員共通で指定し、
 * 設定者ごとに一次承認者・二次承認者を割り当てる。
 * 割り当ては定量・定性どちらのシートにも共通で適用される。
 * Supabase Storage バケットに JSON として永続化（他ストアと同じ方式）。
 */
export type GoalAssignment = {
  id: string;
  period: string; // "2026-09"
  employeeId: string;
  employeeName: string;
  primaryApproverId: string;
  primaryApproverName: string;
  secondaryApproverId?: string;
  secondaryApproverName?: string;
  createdAt: string;
  updatedAt: string;
};

const BUCKET = "goal-assignments";
const PREFIX = "assignments/";
const ROSTER_PREFIX = "rosters/";

/**
 * 設定者の表示順・対象/対象外の設定（全期間・全シート共通）。
 * order: 設定者の表示順（employeeId の並び）
 * excludedIds: シート記入の対象外スタッフ
 */
export type RosterSettings = {
  order: string[];
  excludedIds: string[];
};

function rosterPath(): string {
  return `${ROSTER_PREFIX}global.json`;
}

function assignmentPath(id: string): string {
  return `${PREFIX}${id}.json`;
}

function assignmentId(period: string, employeeId: string): string {
  return `${period}__${employeeId}`;
}

async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

function getStore(): GoalAssignment[] {
  if (typeof globalThis === "undefined") return [];
  const key = "__goal_assignments_memory__";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g[key]) g[key] = [];
  return g[key] as GoalAssignment[];
}

async function getJson<T>(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  path: string
): Promise<T | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
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

export async function listGoalAssignments(params?: {
  period?: string;
}): Promise<GoalAssignment[]> {
  let items: GoalAssignment[];
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(PREFIX, { limit: 1000 });
    if (error) return [];
    const files = (data || []).filter((f) => f.name.endsWith(".json"));
    const parsed = await Promise.all(
      files.map((f) => getJson<GoalAssignment>(supabase, `${PREFIX}${f.name}`))
    );
    items = parsed.filter((a): a is GoalAssignment => a !== null);
  } else {
    items = getStore();
  }

  // 旧形式（period__kind__employeeId）のデータも期間が一致すれば読み替える。
  // 同一設定者に新旧両方ある場合は新形式（period__employeeId）を優先。
  const filtered = items.filter((a) => !params?.period || a.period === params.period);
  const byEmployee = new Map<string, GoalAssignment>();
  for (const a of filtered.sort((x, y) => x.updatedAt.localeCompare(y.updatedAt))) {
    const id = a.id;
    const isNewFormat = id === assignmentId(a.period, a.employeeId);
    const prev = byEmployee.get(a.employeeId);
    if (!prev) {
      byEmployee.set(a.employeeId, a);
    } else {
      const prevIsNew = prev.id === assignmentId(prev.period, prev.employeeId);
      if (isNewFormat && !prevIsNew) byEmployee.set(a.employeeId, a);
      else if (isNewFormat === prevIsNew) byEmployee.set(a.employeeId, a); // より新しい方
    }
  }
  return Array.from(byEmployee.values()).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, "ja")
  );
}

export async function getGoalAssignment(
  period: string,
  employeeId: string
): Promise<GoalAssignment | null> {
  const id = assignmentId(period, employeeId);
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const direct = await getJson<GoalAssignment>(supabase, assignmentPath(id));
    if (direct) return direct;
    // 旧形式（kind 入り）にフォールバック
    const legacy = await listGoalAssignments({ period });
    return legacy.find((a) => a.employeeId === employeeId) ?? null;
  }
  const found = getStore().find((a) => a.id === id);
  if (found) return found;
  return (
    getStore().find((a) => a.period === period && a.employeeId === employeeId) ?? null
  );
}

export async function upsertGoalAssignment(input: {
  period: string;
  employeeId: string;
  employeeName: string;
  primaryApproverId: string;
  primaryApproverName: string;
  secondaryApproverId?: string;
  secondaryApproverName?: string;
}): Promise<GoalAssignment> {
  const now = new Date().toISOString();
  const id = assignmentId(input.period, input.employeeId);
  const existing = await getGoalAssignment(input.period, input.employeeId);

  const record: GoalAssignment = {
    id,
    period: input.period,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    primaryApproverId: input.primaryApproverId,
    primaryApproverName: input.primaryApproverName,
    secondaryApproverId: input.secondaryApproverId || undefined,
    secondaryApproverName: input.secondaryApproverId
      ? input.secondaryApproverName
      : undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await putJson(supabase, assignmentPath(id), record);
    // 旧形式（kind 入り）が残っていれば削除して新形式に一本化
    await supabase.storage.from(BUCKET).remove([
      assignmentPath(`${input.period}__quantitative__${input.employeeId}`),
      assignmentPath(`${input.period}__qualitative__${input.employeeId}`),
    ]);
  } else {
    const store = getStore();
    const idx = store.findIndex(
      (a) => a.period === input.period && a.employeeId === input.employeeId
    );
    if (idx >= 0) store[idx] = record;
    else store.push(record);
  }
  return record;
}

export async function deleteGoalAssignment(
  period: string,
  employeeId: string
): Promise<void> {
  const id = assignmentId(period, employeeId);
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await supabase.storage.from(BUCKET).remove([
      assignmentPath(id),
      assignmentPath(`${period}__quantitative__${employeeId}`),
      assignmentPath(`${period}__qualitative__${employeeId}`),
    ]);
  } else {
    const store = getStore();
    const idx = store.findIndex((a) => a.period === period && a.employeeId === employeeId);
    if (idx >= 0) store.splice(idx, 1);
  }
}

// ---- Roster（表示順・対象/非対象）: 全期間・全シート共通 ----
let memoryRoster: RosterSettings | null = null;

export async function getRosterSettings(): Promise<RosterSettings> {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const data = await getJson<RosterSettings>(supabase, rosterPath());
    return {
      order: Array.isArray(data?.order) ? data.order : [],
      excludedIds: Array.isArray(data?.excludedIds) ? data.excludedIds : [],
    };
  }
  const data = memoryRoster;
  return {
    order: Array.isArray(data?.order) ? data.order : [],
    excludedIds: Array.isArray(data?.excludedIds) ? data.excludedIds : [],
  };
}

export async function saveRosterSettings(settings: RosterSettings): Promise<void> {
  const clean: RosterSettings = {
    order: Array.isArray(settings.order) ? settings.order : [],
    excludedIds: Array.isArray(settings.excludedIds) ? settings.excludedIds : [],
  };
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await putJson(supabase, rosterPath(), clean);
  } else {
    memoryRoster = clean;
  }
}
