"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getMvgStaffForVotingAction } from "@/lib/mvgActions";
import VoteModal from "@/components/mvg/VoteModal";

type SessionInfo = {
  name?: string;
  employeeId?: string;
};

function parseCookieSession(): SessionInfo | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/kt_session=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as SessionInfo;
  } catch {
    return null;
  }
}

export default function MvgVotePage({
  initialPeriod,
  initialStaff,
  initialPeriods,
}: {
  initialPeriod: string;
  initialStaff: { id: string; name: string; photo?: string; team?: string }[];
  initialPeriods: string[];
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [staff, setStaff] = useState(initialStaff);
  const [periods, setPeriods] = useState(initialPeriods);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string; photo?: string } | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSession(parseCookieSession());
  }, []);

  const filteredStaff = useMemo(() => {
    const q = search.trim();
    return staff.filter((s) =>
      s.name.includes(q) || (s.team ?? "").includes(q)
    );
  }, [staff, search]);

  function refresh() {
    startTransition(async () => {
      const res = await getMvgStaffForVotingAction(period);
      if (!res.ok) return;
      setStaff(res.staff);
      setPeriods(res.periods);
    });
  }

  function handlePeriodChange(next: string) {
    setPeriod(next);
    startTransition(async () => {
      const res = await getMvgStaffForVotingAction(next);
      if (!res.ok) return;
      setStaff(res.staff);
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Most Valuable Giver</h1>
            <p className="text-sm text-gray-500">スタッフ同士で「ありがとう」を投票し合い、年間で最も感謝を届けた人を表彰します。</p>
          </div>
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 focus:border-emerald-400 focus:outline-none"
          >
            {periods.map((p) => (
              <option key={p} value={p}>
                {p}年
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-bold text-gray-800">投票するスタッフを選択</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前・チームで検索..."
              className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {isPending ? (
            <div className="flex items-center justify-center py-10">
              <span className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredStaff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected({ id: s.id, name: s.name, photo: s.photo })}
                  className="flex flex-col items-center gap-2 rounded-xl border p-3 transition hover:border-emerald-400 hover:bg-emerald-50 text-left"
                >
                  {s.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photo} alt={s.name} className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xl font-bold">
                      {s.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-xs font-bold text-gray-800 line-clamp-1">{s.name}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-1">{s.team}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {selected && session?.name ? (
        <VoteModal
          recipient={selected}
          giverName={session.name}
          onClose={() => setSelected(null)}
          onVoted={() => {
            setSelected(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
