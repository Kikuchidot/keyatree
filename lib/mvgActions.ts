"use server";

import { revalidatePath } from "next/cache";
import {
  createVote,
  deleteVote,
  getAvailablePeriods,
  getVoteCountsByPeriod,
  getVotesForEmployee,
  listVotes,
  updateVote,
  type MvgVote,
  type MvgRankingEntry,
} from "@/lib/mvgStore";
import {
  deleteMvgEvent,
  getActiveMvgEvent,
  getMvgEventPeriods,
  listMvgEvents,
  saveMvgEvent,
  setActiveMvgEvent,
  type MvgEvent,
} from "@/lib/mvgEventStore";
import { getServerSession } from "@/lib/goalNavigatorStore";
import { listStaff } from "@/lib/staffServerStore";

const ADMIN_NAMES = new Set([
  "杉田",
  "岡",
  "谷",
  "開発者 TOMO",
]);

export async function isMvgAdmin(name: string | undefined | null): Promise<boolean> {
  if (!name) return false;
  return ADMIN_NAMES.has(name.trim());
}

export async function assertMvgAdmin(): Promise<
  | { ok: true; session: { name: string; employeeId: string } }
  | { ok: false; message: string }
> {
  const session = await getServerSession();
  if (!session?.name) {
    return { ok: false, message: "ログイン情報を確認できませんでした" };
  }
  if (!isMvgAdmin(session.name)) {
    return { ok: false, message: "集計画面へのアクセス権限がありません" };
  }
  return {
    ok: true,
    session: {
      name: session.name,
      employeeId: session.employeeId || session.id || "",
    },
  };
}

export async function castVoteAction(
  toEmployeeId: string,
  message: string,
  votedAt?: string
): Promise<{ ok: true; vote: MvgVote } | { ok: false; message: string }> {
  const session = await getServerSession();
  if (!session) {
    return { ok: false, message: "ログイン情報を確認できませんでした" };
  }

  const fromEmployeeId = session.employeeId || session.id;
  if (!fromEmployeeId) {
    return { ok: false, message: "投票者情報を特定できませんでした" };
  }
  if (fromEmployeeId === toEmployeeId) {
    return { ok: false, message: "自分自身への投票はできません" };
  }
  if (!message.trim()) {
    return { ok: false, message: "感謝メッセージを入力してください" };
  }

  const staff = await listStaff();
  const to = staff.find((s) => s.id === toEmployeeId);
  if (!to) return { ok: false, message: "投票先のスタッフが見つかりません" };

  const vote = await createVote({
    fromEmployeeId,
    fromEmployeeName: session.name,
    toEmployeeId,
    toEmployeeName: to.name,
    message: message.trim(),
    votedAt: votedAt || new Date().toISOString().slice(0, 10),
  });

  revalidatePath("/mvg");
  revalidatePath(`/employees/${toEmployeeId}`);

  return { ok: true, vote };
}

export async function getMvgRankingAction(period: string): Promise<
  | { ok: true; ranking: MvgRankingEntry[]; totalVotes: number }
  | { ok: false; message: string }
> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  const ranking = await getVoteCountsByPeriod(period);
  const totalVotes = ranking.reduce((sum, r) => sum + r.count, 0);
  return { ok: true, ranking, totalVotes };
}

export async function getMvgVotesForEmployeeAction(
  employeeId: string,
  period?: string
): Promise<{ ok: true; votes: MvgVote[] } | { ok: false; message: string }> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  const votes = await getVotesForEmployee(employeeId, period);
  return { ok: true, votes };
}

export async function getMvgVotesAction(period?: string): Promise<
  | { ok: true; votes: MvgVote[] }
  | { ok: false; message: string }
> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  const all = await listVotes();
  const votes = period ? all.filter((v) => v.period === period) : all;
  return { ok: true, votes };
}

export async function getMvgPeriodsAction(): Promise<{ ok: true; periods: string[] }> {
  const periods = await getAvailablePeriods();
  return { ok: true, periods };
}

export async function getMvgStaffWithRankingAction(period: string): Promise<
  | { ok: true; staff: { id: string; name: string; photo?: string; team?: string }[]; ranking: MvgRankingEntry[]; totalVotes: number; periods: string[] }
  | { ok: false; message: string }
> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  const [staff, rankingRes, periods] = await Promise.all([
    listStaff(),
    getMvgRankingAction(period),
    getAvailablePeriods(),
  ]);
  if (!rankingRes.ok) return rankingRes;
  return {
    ok: true,
    staff: staff.map((s) => ({ id: s.id, name: s.name, photo: s.photo, team: s.team || s.department })),
    ranking: rankingRes.ranking,
    totalVotes: rankingRes.totalVotes,
    periods,
  };
}

export async function getMvgStaffForVotingAction(period: string): Promise<
  | { ok: true; staff: { id: string; name: string; photo?: string; team?: string }[]; periods: string[] }
  | { ok: false; message: string }
> {
  const session = await getServerSession();
  if (!session?.name) {
    return { ok: false, message: "ログイン情報を確認できませんでした" };
  }
  const [staff, periods, event] = await Promise.all([
    listStaff(),
    getMvgEventPeriods(),
    getActiveMvgEvent(period),
  ]);
  const participantIds = new Set(event?.participantIds ?? []);
  const visibleStaff =
    participantIds.size > 0
      ? staff.filter((s) => participantIds.has(s.id))
      : staff;
  return {
    ok: true,
    staff: visibleStaff.map((s) => ({ id: s.id, name: s.name, photo: s.photo, team: s.team || s.department })),
    periods,
  };
}

export async function castManualVoteAction(
  toEmployeeId: string,
  message: string,
  votedAt?: string
): Promise<{ ok: true; vote: MvgVote } | { ok: false; message: string }> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;

  if (!message.trim()) {
    return { ok: false, message: "感謝メッセージを入力してください" };
  }

  const staff = await listStaff();
  const to = staff.find((s) => s.id === toEmployeeId);
  if (!to) return { ok: false, message: "投票先のスタッフが見つかりません" };

  const vote = await createVote({
    fromEmployeeId: auth.session.employeeId,
    fromEmployeeName: auth.session.name,
    toEmployeeId,
    toEmployeeName: to.name,
    message: message.trim(),
    votedAt: votedAt || new Date().toISOString().slice(0, 10),
  });

  revalidatePath("/mvg/admin");
  return { ok: true, vote };
}

export async function deleteMvgVoteAction(voteId: string): Promise<
  | { ok: true }
  | { ok: false; message: string }
> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  await deleteVote(voteId);
  revalidatePath("/mvg/admin");
  return { ok: true };
}

export async function updateMvgVoteAction(
  voteId: string,
  input: { message?: string; votedAt?: string }
): Promise<{ ok: true; vote: MvgVote } | { ok: false; message: string }> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  const vote = await updateVote(voteId, input);
  if (!vote) return { ok: false, message: "投票が見つかりません" };
  revalidatePath("/mvg/admin");
  return { ok: true, vote };
}

export async function getMvgEventsAction(): Promise<
  | { ok: true; events: MvgEvent[] }
  | { ok: false; message: string }
> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  const events = await listMvgEvents();
  return { ok: true, events };
}

export async function saveMvgEventAction(input: {
  id?: string;
  period: string;
  title: string;
  participantIds: string[];
  isActive?: boolean;
}): Promise<{ ok: true; event: MvgEvent } | { ok: false; message: string }> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  const event = await saveMvgEvent({
    ...input,
    participantIds: input.participantIds,
  });
  revalidatePath("/mvg/admin");
  revalidatePath("/mvg");
  return { ok: true, event };
}

export async function deleteMvgEventAction(id: string): Promise<
  | { ok: true }
  | { ok: false; message: string }
> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  await deleteMvgEvent(id);
  revalidatePath("/mvg/admin");
  revalidatePath("/mvg");
  return { ok: true };
}

export async function activateMvgEventAction(id: string): Promise<
  | { ok: true }
  | { ok: false; message: string }
> {
  const auth = await assertMvgAdmin();
  if (!auth.ok) return auth;
  await setActiveMvgEvent(id);
  revalidatePath("/mvg/admin");
  revalidatePath("/mvg");
  return { ok: true };
}
