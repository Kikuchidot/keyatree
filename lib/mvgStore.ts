import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

/**
 * MVG（Most Valuable Giver）投票を Supabase Storage に JSON として永続化。
 * スタッフ/目標ナビと同じく DDL 不要のバケット方式。
 */

const BUCKET = "mvg-votes";
const VOTE_PREFIX = "votes";

// ---- In-memory fallback ----
const g = globalThis as typeof globalThis & { __keyatreeMvgVotes?: MvgVote[] };
function getStore() {
  if (!g.__keyatreeMvgVotes) {
    g.__keyatreeMvgVotes = [];
  }
  return g.__keyatreeMvgVotes;
}

// ---- Storage helpers ----
type Admin = ReturnType<typeof getSupabaseAdmin>;
let bucketReady = false;

async function ensureBucket(supabase: Admin) {
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

function votePath(id: string) {
  return `${VOTE_PREFIX}/${encodeURIComponent(id)}.json`;
}

async function putJson(supabase: Admin, path: string, value: unknown) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, JSON.stringify(value), {
    contentType: "application/json",
    cacheControl: "0",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

async function getJson<T>(supabase: Admin, path: string): Promise<T | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRoleKey) {
    try {
      const endpoint = `${url}/storage/v1/object/${BUCKET}/${path}?_cb=${Date.now()}`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
    } catch {
      // fall through
    }
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function listJson<T>(supabase: Admin, prefix: string): Promise<T[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const files = data.filter((i) => i.name.endsWith(".json"));
  const results = (await Promise.all(
    files.map((i) => getJson<T>(supabase, `${prefix}/${i.name}`))
  )) as (T | null)[];
  return results.filter((r): r is T => r !== null);
}

// ---- Types ----
export type MvgVote = {
  id: string;
  period: string; // 年（例：2026）
  fromEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeId: string;
  toEmployeeName: string;
  message: string;
  votedAt: string; // ISO日付
};

// ---- CRUD ----
export async function createVote(input: {
  fromEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeId: string;
  toEmployeeName: string;
  message: string;
  votedAt: string;
}): Promise<MvgVote> {
  if (input.fromEmployeeId === input.toEmployeeId) {
    throw new Error("自分自身への投票はできません");
  }
  const period = new Date(input.votedAt).getFullYear().toString();
  const vote: MvgVote = {
    id: crypto.randomUUID(),
    period,
    ...input,
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await putJson(supabase, votePath(vote.id), vote);
  } else {
    getStore().push(vote);
  }
  return vote;
}

export async function listVotes(): Promise<MvgVote[]> {
  let votes: MvgVote[];
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    votes = await listJson<MvgVote>(supabase, VOTE_PREFIX);
  } else {
    votes = [...getStore()];
  }
  return votes.sort((a, b) => b.votedAt.localeCompare(a.votedAt));
}

export async function getVotesForEmployee(employeeId: string, period?: string): Promise<MvgVote[]> {
  const votes = await listVotes();
  return votes.filter((v) => v.toEmployeeId === employeeId && (!period || v.period === period));
}

export type MvgRankingEntry = {
  employeeId: string;
  name: string;
  count: number;
};

export async function getVoteCountsByPeriod(period: string): Promise<MvgRankingEntry[]> {
  const votes = await listVotes();
  const map = new Map<string, MvgRankingEntry>();
  for (const v of votes) {
    if (v.period !== period) continue;
    const existing = map.get(v.toEmployeeId);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(v.toEmployeeId, {
        employeeId: v.toEmployeeId,
        name: v.toEmployeeName,
        count: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export async function getAvailablePeriods(): Promise<string[]> {
  const votes = await listVotes();
  const periods = new Set(votes.map((v) => v.period));
  const current = new Date().getFullYear().toString();
  periods.add(current);
  return Array.from(periods).sort((a, b) => b.localeCompare(a));
}

export async function deleteVote(voteId: string): Promise<void> {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await supabase.storage.from(BUCKET).remove([votePath(voteId)]);
  } else {
    const store = getStore();
    const idx = store.findIndex((v) => v.id === voteId);
    if (idx >= 0) store.splice(idx, 1);
  }
}

export async function updateVote(
  voteId: string,
  input: {
    message?: string;
    votedAt?: string;
  }
): Promise<MvgVote | null> {
  const votes = await listVotes();
  const target = votes.find((v) => v.id === voteId);
  if (!target) return null;
  const updated: MvgVote = { ...target };
  if (input.message !== undefined) updated.message = input.message;
  if (input.votedAt !== undefined) {
    updated.votedAt = input.votedAt;
    updated.period = new Date(input.votedAt).getFullYear().toString();
  }
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await putJson(supabase, votePath(updated.id), updated);
  } else {
    const store = getStore();
    const idx = store.findIndex((v) => v.id === voteId);
    if (idx >= 0) store[idx] = updated;
  }
  return updated;
}
