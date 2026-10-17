import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";

export type MvgEvent = {
  id: string;
  period: string;
  title: string;
  participantIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const BUCKET = "mvg-events";
const PREFIX = "events/";

function eventPath(id: string): string {
  return `${PREFIX}${id}.json`;
}

async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

function getStore(): MvgEvent[] {
  if (typeof globalThis === "undefined") return [];
  const key = "__mvg_events_memory__";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g[key]) g[key] = [];
  return g[key] as MvgEvent[];
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

export async function listMvgEvents(): Promise<MvgEvent[]> {
  let events: MvgEvent[];
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(PREFIX, { limit: 1000 });
    if (error) return [];
    const files = (data || []).filter((f) => f.name.endsWith(".json")
    );
    const parsed = await Promise.all(
      files.map((f) => getJson<MvgEvent>(supabase, `${PREFIX}${f.name}`))
    );
    events = parsed.filter((e): e is MvgEvent => e !== null);
  } else {
    events = getStore();
  }
  return events.sort((a, b) => b.period.localeCompare(a.period) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function getMvgEventById(id: string): Promise<MvgEvent | null> {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    return await getJson<MvgEvent>(supabase, eventPath(id));
  }
  return getStore().find((e) => e.id === id) ?? null;
}

export async function getActiveMvgEvent(period: string): Promise<MvgEvent | null> {
  const events = await listMvgEvents();
  return (
    events.find((e) => e.period === period && e.isActive) ||
    events.find((e) => e.period === period) ||
    null
  );
}

export async function saveMvgEvent(input: {
  id?: string;
  period: string;
  title: string;
  participantIds: string[];
  isActive?: boolean;
}): Promise<MvgEvent> {
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  const event: MvgEvent = {
    id,
    period: input.period,
    title: input.title,
    participantIds: input.participantIds,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await putJson(supabase, eventPath(id), event);
  } else {
    const store = getStore();
    const idx = store.findIndex((e) => e.id === id);
    if (idx >= 0) store[idx] = event;
    else store.push(event);
  }
  return event;
}

export async function deleteMvgEvent(id: string): Promise<void> {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);
    await supabase.storage.from(BUCKET).remove([eventPath(id)]);
  } else {
    const store = getStore();
    const idx = store.findIndex((e) => e.id === id);
    if (idx >= 0) store.splice(idx, 1);
  }
}

export async function setActiveMvgEvent(id: string): Promise<void> {
  const events = await listMvgEvents();
  const target = events.find((e) => e.id === id);
  if (!target) return;
  await Promise.all(
    events
      .filter((e) => e.period === target.period && e.id !== id)
      .map((e) => saveMvgEvent({ ...e, isActive: false }))
  );
  await saveMvgEvent({ ...target, isActive: true });
}

export async function getMvgEventPeriods(): Promise<string[]> {
  const events = await listMvgEvents();
  const periods = new Set(events.map((e) => e.period));
  const current = new Date().getFullYear().toString();
  periods.add(current);
  return Array.from(periods).sort((a, b) => b.localeCompare(a));
}
