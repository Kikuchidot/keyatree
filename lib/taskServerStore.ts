import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/supabaseServer";
import type { FullTask, TaskMember, TaskMessage, TaskStatus, TaskEditInput } from "@/lib/taskStore";

/**
 * タスク（依頼）を Supabase Storage に JSON として永続化する。
 * スタッフ / チャンネルと同じ DDL 不要のバケット方式。env未設定時はメモリ fallback。
 * トーク発の依頼を全端末・全ユーザーで共有し、担当者のマイページ等に反映するために使用する。
 */

const BUCKET = "tasks";
const PREFIX = "items";

// ---- In-memory fallback ----
type GlobalStore = { tasks: Map<string, FullTask>; seeded: boolean };
const g = globalThis as unknown as { __keyatreeTaskStore?: GlobalStore };
function memory(): GlobalStore {
  if (!g.__keyatreeTaskStore) g.__keyatreeTaskStore = { tasks: new Map(), seeded: false };
  return g.__keyatreeTaskStore;
}

// ---- Storage helpers ----
let bucketReady = false;
async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !/exist/i.test(error.message)) throw new Error(`bucket作成に失敗: ${error.message}`);
  }
  bucketReady = true;
}
function itemPath(id: string) {
  return `${PREFIX}/${encodeURIComponent(id)}.json`;
}
async function putJson(supabase: ReturnType<typeof getSupabaseAdmin>, path: string, value: unknown) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, JSON.stringify(value), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) throw new Error(error.message);
}
async function getJson<T>(supabase: ReturnType<typeof getSupabaseAdmin>, path: string): Promise<T | null> {
  // Bypass Supabase Storage CDN cache (lags ~5-10s even with cacheControl:"0")
  // by fetching the authenticated object endpoint directly with a cache-buster.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRoleKey) {
    try {
      const endpoint = `${url}/storage/v1/object/${BUCKET}/${path}?_cb=${Date.now()}`;
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        cache: "no-store",
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
      if (res.status === 404) return null;
    } catch {
      // fall through to SDK download below
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
async function listJson<T>(supabase: ReturnType<typeof getSupabaseAdmin>, prefix: string): Promise<T[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 2000 });
  if (error || !data) return [];
  const files = data.filter((i) => i.name.endsWith(".json"));
  const results = (await Promise.all(files.map((i) => getJson<T>(supabase, `${prefix}/${i.name}`)))) as (T | null)[];
  return results.filter((r): r is T => r !== null);
}
function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
function now() {
  return new Date().toISOString();
}

// ---- Seed（初回のデモデータ） ----
function seedData(): FullTask[] {
  const d = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  return [
    {
      id: "seed-t1",
      title: "山田様 物件案内資料の作成",
      description: "山田様向けに新築マンションの案内資料を作成する。間取り図・価格表・周辺施設マップを含める。",
      deadline: "2026-06-20",
      category: "営業",
      type: "personal",
      priority: "high",
      status: "in_progress",
      ownerId: "001",
      ownerName: "鈴木 一郎",
      members: [
        { id: "001", name: "鈴木 一郎", role: "owner", joinedAt: d(3) },
        { id: "002", name: "田中 花子", role: "watcher", joinedAt: d(2) },
      ],
      messages: [
        { id: "m1", senderId: "001", senderName: "鈴木 一郎", subject: "資料方向性の確認", toIds: ["all"], toNames: ["全員"], text: "山田様案件を開始しました。資料の方向性について確認させてください。", sentAt: d(2) },
        { id: "m2", senderId: "002", senderName: "田中 花子", subject: "Re: 資料方向性の確認", toIds: ["001"], toNames: ["鈴木 一郎"], text: "了解しました。先方は3LDK以上を希望されているので、その条件に絞って作成してください。", sentAt: d(1), replyToId: "m1" },
      ],
      createdAt: d(3),
      updatedAt: d(1),
    },
    {
      id: "seed-t2",
      title: "Q2営業報告書の提出",
      description: "第2四半期の営業実績をまとめて報告書を作成・提出する。売上・案件数・新規顧客数を記載。",
      deadline: "2026-06-18",
      category: "報告",
      type: "personal",
      priority: "high",
      status: "overdue",
      ownerId: "001",
      ownerName: "鈴木 一郎",
      members: [
        { id: "001", name: "鈴木 一郎", role: "owner", joinedAt: d(7) },
        { id: "002", name: "田中 花子", role: "assignee", joinedAt: d(7) },
      ],
      messages: [
        { id: "m3", senderId: "002", senderName: "田中 花子", subject: "Q2報告書の対応状況確認", toIds: ["001"], toNames: ["鈴木 一郎"], text: "Q2報告書の提出期限が近づいています。対応状況を教えてください。", sentAt: d(1) },
      ],
      createdAt: d(7),
      updatedAt: d(1),
    },
    {
      id: "seed-t3",
      title: "下半期予算計画書の承認",
      description: "下半期の各部門予算計画書を取りまとめ、役員会での承認を得る。",
      deadline: "2026-06-25",
      category: "管理",
      type: "org",
      priority: "high",
      status: "in_progress",
      ownerId: "002",
      ownerName: "田中 花子",
      members: [
        { id: "002", name: "田中 花子", role: "owner", joinedAt: d(5) },
        { id: "001", name: "鈴木 一郎", role: "assignee", joinedAt: d(5) },
        { id: "003", name: "佐藤 次郎", role: "assignee", joinedAt: d(4) },
      ],
      messages: [],
      createdAt: d(5),
      updatedAt: d(2),
    },
  ];
}

export async function seedTasks(): Promise<void> {
  if (!isSupabaseEnabled()) {
    const m = memory();
    if (m.seeded || m.tasks.size > 0) {
      m.seeded = true;
      return;
    }
    for (const t of seedData()) m.tasks.set(t.id, t);
    m.seeded = true;
    return;
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  const existing = await listJson<FullTask>(supabase, PREFIX);
  if (existing.length > 0) return;
  for (const t of seedData()) await putJson(supabase, itemPath(t.id), t);
}

async function readAll(): Promise<FullTask[]> {
  if (!isSupabaseEnabled()) return Array.from(memory().tasks.values());
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  return listJson<FullTask>(supabase, PREFIX);
}

async function write(task: FullTask): Promise<FullTask> {
  if (!isSupabaseEnabled()) {
    memory().tasks.set(task.id, task);
    return task;
  }
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  await putJson(supabase, itemPath(task.id), task);
  return task;
}

export type TaskFilter = {
  talkId?: string;
  channelId?: string;
  assigneeId?: string;
  archived?: boolean;
};

export async function listTasks(filter: TaskFilter = {}): Promise<FullTask[]> {
  const all = await readAll();
  const wantArchived = filter.archived === true;
  return all
    .filter((t) => Boolean(t.archived) === wantArchived)
    .filter((t) => (filter.talkId ? t.talkId === filter.talkId : true))
    .filter((t) => (filter.channelId ? t.channelId === filter.channelId : true))
    .filter((t) => (filter.assigneeId ? t.members.some((m) => m.id === filter.assigneeId) : true))
    .sort((a, b) =>
      wantArchived
        ? (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
}

export async function getTask(id: string): Promise<FullTask | null> {
  if (!isSupabaseEnabled()) return memory().tasks.get(id) ?? null;
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  return getJson<FullTask>(supabase, itemPath(id));
}

export async function createTask(input: {
  title: string;
  description?: string;
  deadline?: string;
  category: string;
  type: FullTask["type"];
  priority: FullTask["priority"];
  status?: TaskStatus;
  ownerId: string;
  ownerName: string;
  assignees?: { id: string; name: string }[];
  channelId?: string;
  talkId?: string;
  talkName?: string;
}): Promise<FullTask> {
  const t = now();
  const members: TaskMember[] = [{ id: input.ownerId, name: input.ownerName, role: "owner", joinedAt: t }];
  for (const a of input.assignees ?? []) {
    if (a.id === input.ownerId) continue;
    if (members.some((m) => m.id === a.id)) continue;
    members.push({ id: a.id, name: a.name, role: "assignee", joinedAt: t });
  }
  const task: FullTask = {
    id: newId(),
    title: input.title,
    description: input.description ?? "",
    deadline: input.deadline ?? "",
    category: input.category,
    type: input.type,
    priority: input.priority,
    status: input.status ?? "not_started",
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    members,
    messages: [],
    createdAt: t,
    updatedAt: t,
    channelId: input.channelId,
    talkId: input.talkId,
    talkName: input.talkName,
  };
  return write(task);
}

export async function updateTask(id: string, input: TaskEditInput): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  return write({ ...task, ...input, updatedAt: now() });
}

export async function updateStatus(id: string, status: TaskStatus): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  const next: FullTask = { ...task, status, updatedAt: now() };
  if (status === "completed") next.completedAt = now();
  return write(next);
}

export async function addMessage(id: string, msg: Omit<TaskMessage, "id" | "sentAt">): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  const newMsg: TaskMessage = { ...msg, id: newId(), sentAt: now() };
  return write({ ...task, messages: [...task.messages, newMsg], updatedAt: now() });
}

export async function deleteMessage(id: string, msgId: string): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  const messages = task.messages.filter((m) => m.id !== msgId && m.replyToId !== msgId);
  return write({ ...task, messages, updatedAt: now() });
}

export async function toggleReaction(id: string, msgId: string, emoji: string, userId: string): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  const messages = task.messages.map((m) => {
    if (m.id !== msgId) return m;
    const reactions = { ...(m.reactions || {}) };
    const users = reactions[emoji] || [];
    if (users.includes(userId)) {
      const next = users.filter((u) => u !== userId);
      if (next.length === 0) delete reactions[emoji];
      else reactions[emoji] = next;
    } else {
      reactions[emoji] = [...users, userId];
    }
    return { ...m, reactions };
  });
  return write({ ...task, messages, updatedAt: now() });
}

export async function addMember(id: string, member: TaskMember): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  if (task.members.some((m) => m.id === member.id)) return task;
  return write({ ...task, members: [...task.members, member], updatedAt: now() });
}

export async function removeMember(id: string, memberId: string): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  const members = task.members.filter((m) => m.id !== memberId || m.role === "owner");
  return write({ ...task, members, updatedAt: now() });
}

export async function archiveTask(id: string): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  return write({ ...task, archived: true, archivedAt: now() });
}

export async function restoreTask(id: string): Promise<FullTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  const next = { ...task, archived: false, updatedAt: now() };
  delete next.archivedAt;
  return write(next);
}

export async function deleteTask(id: string): Promise<boolean> {
  if (!isSupabaseEnabled()) return memory().tasks.delete(id);
  const supabase = getSupabaseAdmin();
  await ensureBucket(supabase);
  await supabase.storage.from(BUCKET).remove([itemPath(id)]);
  return true;
}
