"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import {
  getCategories, formatDeadline, toDateTimeLocal,
  STATUS_CONFIG, PRIORITY_CONFIG,
  type FullTask, type TaskStatus, type TaskMember, type TaskMessage, type TaskPriority, type TaskType,
} from "@/lib/taskStore";
import {
  apiGetTask, apiAddMessage, apiEditTask, apiSetStatus, apiAddMember,
  apiRemoveMember, apiToggleReaction, apiArchiveTask, apiDeleteMessage,
} from "@/lib/taskClient";
import { getClientSession, sessionMemberId } from "@/lib/clientSession";

type Me = { id: string; name: string };

/* ── ユーティリティ ── */
function fmtDT(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtD(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 text-gray-900 rounded px-0.5">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "not_started", label: "未着手" },
  { value: "in_progress", label: "進行中" },
  { value: "overdue",     label: "期日超過" },
  { value: "completed",   label: "完了" },
];

const EMOJI_LIST = ["👍","✅","🙏","💪","🔥","😊","👏","❤️"];

function EmojiPicker({ onSelect }: { onSelect: (e: string) => void }) {
  return (
    <div className="absolute z-30 bottom-full mb-1 bg-white border border-gray-200 rounded-2xl shadow-lg px-2 py-1.5 flex gap-1 whitespace-nowrap">
      {EMOJI_LIST.map(e => (
        <button key={e} onClick={ev => { ev.stopPropagation(); onSelect(e); }}
          className="text-lg hover:scale-125 transition-transform">{e}</button>
      ))}
    </div>
  );
}

function ToBadges({ toIds, toNames }: { toIds: string[]; toNames: string[] }) {
  if (!toIds || toIds[0] === "all") {
    return <span className="inline-flex items-center text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">全員</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {toNames.map((n, i) => (
        <span key={i} className="inline-flex items-center text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{n}</span>
      ))}
    </span>
  );
}

function MessageBubble({
  msg, allMessages, me, query, onToggleReaction, onReply,
}: {
  msg: TaskMessage;
  allMessages: TaskMessage[];
  me: Me;
  query: string;
  onToggleReaction: (msgId: string, emoji: string) => void;
  onReply: (msg: TaskMessage) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const isMe = msg.senderId === me.id;
  const isSystem = msg.senderId === "system";
  const parentMsg = msg.replyToId ? allMessages.find(m => m.id === msg.replyToId) : null;

  if (isSystem) {
    return (
      <div className="text-center py-1">
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{msg.text}</span>
      </div>
    );
  }

  const reactions = msg.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  return (
    <div className={`group flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold self-end ${isMe ? "bg-emerald-500" : "bg-indigo-400"}`}>
        {msg.senderName.charAt(0)}
      </div>
      <div className={`flex flex-col gap-0.5 max-w-xs lg:max-w-md ${isMe ? "items-end" : "items-start"}`}>
        <div className={`flex flex-wrap items-center gap-1.5 ${isMe ? "justify-end" : "justify-start"}`}>
          <span className="text-xs font-bold text-gray-600">
            <Highlight text={msg.subject || "（件名なし）"} query={query} />
          </span>
          <span className="text-xs text-gray-400">→</span>
          <ToBadges toIds={msg.toIds ?? ["all"]} toNames={msg.toNames ?? ["全員"]} />
        </div>
        {parentMsg && (
          <div className={`w-full border-l-2 border-gray-300 pl-2 mb-0.5 ${isMe ? "text-right" : "text-left"}`}>
            <p className="text-xs text-gray-400 truncate">{parentMsg.senderName}: {parentMsg.text}</p>
          </div>
        )}
        <div className={`flex items-end gap-1.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
          <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${isMe ? "bg-emerald-500 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm"}`}>
            <Highlight text={msg.text} query={query} />
          </div>
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 flex-shrink-0">
            <button onClick={() => onReply(msg)}
              className="w-6 h-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-gray-50"
              title="返信">
              <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5 text-gray-500" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 10l5-5v3h5a4 4 0 010 8H8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button onClick={() => setShowPicker(v => !v)}
              className="w-6 h-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center hover:bg-gray-50"
              title="リアクション">
              <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5 text-gray-500" stroke="currentColor" strokeWidth="1.5">
                <circle cx="10" cy="10" r="8"/>
                <path d="M7 12s1 2 3 2 3-2 3-2" strokeLinecap="round"/>
                <circle cx="7.5" cy="8.5" r="0.75" fill="currentColor" stroke="none"/>
                <circle cx="12.5" cy="8.5" r="0.75" fill="currentColor" stroke="none"/>
              </svg>
            </button>
            {showPicker && <EmojiPicker onSelect={emoji => { onToggleReaction(msg.id, emoji); setShowPicker(false); }} />}
          </div>
        </div>
        {hasReactions && (
          <div className={`flex flex-wrap gap-1 mt-0.5 ${isMe ? "justify-end" : "justify-start"}`}>
            {Object.entries(reactions).map(([emoji, users]) => {
              const reacted = users.includes(me.id);
              return (
                <button key={emoji}
                  onClick={() => onToggleReaction(msg.id, emoji)}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-xs transition ${reacted ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {emoji}<span className="font-bold">{users.length}</span>
                </button>
              );
            })}
          </div>
        )}
        <span className="text-xs text-gray-300">{fmtDT(msg.sentAt)}</span>
      </div>
    </div>
  );
}

type Thread = { root: TaskMessage; replies: TaskMessage[] };

function ThreadCard({
  thread, allMessages, me, query, onToggleReaction, onReply, onDelete, defaultOpen,
}: {
  thread: Thread;
  allMessages: TaskMessage[];
  me: Me;
  query: string;
  onToggleReaction: (msgId: string, emoji: string) => void;
  onReply: (msg: TaskMessage) => void;
  onDelete: (msg: TaskMessage) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { root, replies } = thread;
  const total = 1 + replies.length;
  const isSystem = root.senderId === "system";

  if (isSystem) {
    return (
      <div className="text-center py-1">
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{root.text}</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${root.senderId === me.id ? "bg-emerald-500" : "bg-indigo-400"}`}>
            {root.senderName.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-gray-700 truncate">
                <Highlight text={root.subject || "（件名なし）"} query={query} />
              </span>
              <ToBadges toIds={root.toIds ?? ["all"]} toNames={root.toNames ?? ["全員"]} />
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              <Highlight text={root.text} query={query} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {total > 1 && (
            <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              {total}件
            </span>
          )}
          <span className="text-xs text-gray-400">{fmtDT(root.sentAt).slice(5)}</span>
          <button onClick={() => setOpen(v => !v)} className="text-xs text-gray-400 hover:text-emerald-600 transition px-1">
            {open ? "▲" : "▼"}
          </button>
          <button
            onClick={() => { if (confirm("このスレッドを削除しますか？返信も全て削除されます。")) onDelete(root); }}
            className="text-xs text-gray-300 hover:text-rose-500 transition px-1"
            title="スレッドを削除"
          >
            🗑
          </button>
        </div>
      </div>

      <div className={`transition-all duration-300 overflow-hidden ${open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="border-t bg-gray-50 px-4 py-4 space-y-4">
          <MessageBubble msg={root} allMessages={allMessages} me={me} query={query} onToggleReaction={onToggleReaction} onReply={onReply} />
          {replies.length > 0 && (
            <div className="border-l-2 border-emerald-200 pl-4 space-y-4">
              {replies.map(reply => (
                <MessageBubble key={reply.id} msg={reply} allMessages={allMessages} me={me} query={query} onToggleReaction={onToggleReaction} onReply={onReply} />
              ))}
            </div>
          )}
          <div className="pt-1">
            <button onClick={() => onReply(root)} className="text-xs text-emerald-600 font-bold hover:underline">
              このスレッドに返信する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskEditModal({
  task, onSave, onClose,
}: {
  task: FullTask;
  onSave: (t: FullTask) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [deadline, setDeadline] = useState(toDateTimeLocal(task.deadline));
  const [category, setCategory] = useState(task.category);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [type, setType] = useState<TaskType>(task.type);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<string[]>(() => {
    const base = getCategories();
    return task.category && !base.includes(task.category) ? [task.category, ...base] : base;
  });

  useEffect(() => {
    fetch("/api/task-channels")
      .then((r) => r.json())
      .then((d) => {
        const names = (d?.channels ?? []).map((c: { name: string }) => c.name) as string[];
        if (!Array.isArray(names) || names.length === 0) return;
        setCategories(task.category && !names.includes(task.category) ? [task.category, ...names] : names);
      })
      .catch(() => {});
  }, [task.category]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const updated = await apiEditTask(task.id, { title: title.trim(), description: description.trim(), deadline, category, priority, type });
    if (updated) onSave(updated);
    else setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-base">タスクを編集</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">タイトル <span className="text-rose-500">*</span></label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">詳細・説明</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">期日・時刻</label>
              <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">チャンネル</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">優先度</label>
              <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">種別</label>
              <select value={type} onChange={e => setType(e.target.value as TaskType)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="personal">個人</option>
                <option value="org">組織</option>
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">キャンセル</button>
          <button onClick={handleSave} disabled={!title.trim() || saving}
            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 text-white text-sm font-bold transition">
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ComposePanel({
  members, me, replyTo, onSend, onCancelReply,
}: {
  members: TaskMember[];
  me: Me;
  replyTo: TaskMessage | null;
  onSend: (subject: string, toIds: string[], toNames: string[], text: string, replyToId?: string) => void;
  onCancelReply: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [toAll, setToAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [showMemberList, setShowMemberList] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) {
      setSubject(`Re: ${replyTo.subject || ""}`);
      setToAll(false);
      const sid = replyTo.senderId;
      if (sid !== me.id && sid !== "system") setSelectedIds([sid]);
      bodyRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTo?.id]);

  const toggleId = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setToAll(false);
  };

  const recipientLabel = toAll ? "全員" : selectedIds.length > 0
    ? members.filter(m => selectedIds.includes(m.id)).map(m => m.name).join("、")
    : "宛先を選択してください";
  const recipientValid = toAll || selectedIds.length > 0;
  const canSend = subject.trim() && recipientValid && body.trim();

  const handleSend = () => {
    if (!canSend) return;
    const toIds   = toAll ? ["all"] : selectedIds;
    const toNames = toAll ? ["全員"] : members.filter(m => selectedIds.includes(m.id)).map(m => m.name);
    onSend(subject.trim(), toIds, toNames, body.trim(), replyTo?.id);
    setSubject(""); setToAll(false); setSelectedIds([]); setBody("");
  };

  const otherMembers = members.filter(m => m.id !== me.id);

  return (
    <div className="border-t bg-white">
      {replyTo && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-500 mb-0.5">返信先: {replyTo.subject}</p>
            <p className="text-xs text-gray-400 truncate">{replyTo.senderName}: {replyTo.text}</p>
          </div>
          <button onClick={onCancelReply} className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-xs mt-0.5">×</button>
        </div>
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-gray-500 w-10 flex-shrink-0">件名</label>
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
            placeholder="メッセージの件名を入力"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        </div>
        <div className="flex items-start gap-2">
          <label className="text-xs font-bold text-gray-500 w-10 flex-shrink-0 mt-1.5">宛先</label>
          <div className="flex-1">
            <button onClick={() => setShowMemberList(v => !v)}
              className={`w-full text-left border rounded-lg px-3 py-1.5 text-sm transition flex items-center justify-between ${recipientValid ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
              <span className={recipientValid ? "text-emerald-800 font-semibold" : "text-gray-400"}>{recipientLabel}</span>
              <span className="text-gray-400 text-xs">{showMemberList ? "▲" : "▼"}</span>
            </button>
            {showMemberList && (
              <div className="mt-1 border border-gray-200 rounded-xl bg-white shadow-md overflow-hidden z-20 relative">
                <button onClick={() => { setToAll(true); setSelectedIds([]); setShowMemberList(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-teal-50 transition ${toAll ? "bg-teal-50 font-bold text-teal-700" : "text-gray-700"}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${toAll ? "bg-teal-500 border-teal-500" : "border-gray-300"}`}>
                    {toAll && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  全員に送信
                </button>
                <div className="h-px bg-gray-100" />
                {otherMembers.map(m => {
                  const checked = selectedIds.includes(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleId(m.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-indigo-50 transition ${checked ? "bg-indigo-50 font-bold text-indigo-700" : "text-gray-700"}`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? "bg-indigo-500 border-indigo-500" : "border-gray-300"}`}>
                        {checked && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center text-white text-xs font-bold">{m.name.charAt(0)}</div>
                      <span>{m.name}</span>
                    </button>
                  );
                })}
                {selectedIds.length > 0 && (
                  <div className="px-3 py-2 border-t">
                    <button onClick={() => setShowMemberList(false)}
                      className="w-full py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition">
                      選択を確定する（{selectedIds.length}名）
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={2}
            placeholder="メッセージ本文を入力"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <button onClick={handleSend} disabled={!canSend}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition flex-shrink-0">
            送信
          </button>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button disabled className="flex items-center gap-1.5 text-xs text-gray-300 cursor-not-allowed border border-dashed border-gray-200 rounded-lg px-3 py-1.5">
            <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 4v12M4 10h12" strokeLinecap="round"/>
            </svg>
            ファイル・写真を添付
          </button>
          <span className="text-xs text-gray-300">Supabase Storage 接続後に対応予定</span>
        </div>
        {!recipientValid && body.trim() && (
          <p className="text-xs text-rose-500 font-semibold">宛先を選択してください（全員 または 個別指名）</p>
        )}
      </div>
    </div>
  );
}

/* ── メインページ ── */
export default function TaskWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [me, setMe] = useState<Me>({ id: "", name: "" });
  const [task, setTask] = useState<FullTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<TaskMessage | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [staffList, setStaffList] = useState<{ id: string; name: string; department?: string }[]>([]);

  useEffect(() => {
    const s = getClientSession();
    setMe({ id: sessionMemberId(s) || "", name: s?.name || "" });
    fetch("/api/staff").then(r => r.json()).then(d => {
      if (Array.isArray(d?.staff)) setStaffList(d.staff);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    apiGetTask(id).then((t) => {
      if (!alive) return;
      if (!t) { router.push("/tasks"); return; }
      setTask(t);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id, router]);

  useEffect(() => {
    if (!searchQuery) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [task?.messages.length, searchQuery]);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 50);
  }, [showSearch]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const threads = useMemo<Thread[]>(() => {
    if (!task) return [];
    const msgs = task.messages;
    const rootMsgs = msgs.filter(m => !m.replyToId);
    return rootMsgs.map(root => ({ root, replies: msgs.filter(m => m.replyToId === root.id) }));
  }, [task]);

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(th =>
      [th.root, ...th.replies].some(m =>
        m.text.toLowerCase().includes(q) ||
        (m.subject || "").toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q)
      )
    );
  }, [threads, searchQuery]);

  const handleSend = async (subject: string, toIds: string[], toNames: string[], text: string, replyToId?: string) => {
    if (!task) return;
    const updated = await apiAddMessage(task.id, { subject, toIds, toNames, text, replyToId });
    if (updated) setTask(updated);
    setReplyTo(null);
  };

  const handleToggleReaction = async (msgId: string, emoji: string) => {
    if (!task) return;
    const updated = await apiToggleReaction(task.id, msgId, emoji);
    if (updated) setTask(updated);
  };

  const handleStatusChange = async (status: TaskStatus) => {
    if (!task) return;
    const updated = await apiSetStatus(task.id, status);
    if (updated) { setTask(updated); showToast(`ステータスを「${STATUS_CONFIG[status].label}」に変更しました`); }
  };

  const handleInvite = async (emp: { id: string; name: string }) => {
    if (!task) return;
    const member: TaskMember = { id: emp.id, name: emp.name, role: "assignee", joinedAt: new Date().toISOString() };
    const updated = await apiAddMember(task.id, member);
    if (updated) {
      showToast(`${emp.name} をメンバーに追加しました`);
      const withMsg = await apiAddMessage(task.id, { subject: "__system__", toIds: ["all"], toNames: ["全員"], text: `${emp.name} がメンバーに追加されました。` });
      setTask(withMsg ?? updated);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!task) return;
    const updated = await apiRemoveMember(task.id, memberId);
    if (updated) { setTask(updated); showToast(`${memberName} をメンバーから除外しました`); }
  };

  const handleTaskSave = (updated: FullTask) => {
    setTask(updated);
    setShowEdit(false);
    showToast("タスクを更新しました");
  };

  const handleDeleteThread = async (msg: TaskMessage) => {
    if (!task) return;
    const updated = await apiDeleteMessage(task.id, msg.id);
    if (updated) { setTask(updated); showToast("スレッドを削除しました"); }
  };

  const handleDeleteTask = async () => {
    if (!task) return;
    if (!confirm("このタスクをアーカイブに移動しますか？アーカイブからいつでも復旧・完全削除できます。")) return;
    await apiArchiveTask(task.id);
    router.push("/tasks");
  };

  if (loading || !task) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">読み込み中...</div>;
  }

  const cfg = STATUS_CONFIG[task.status];
  const pri = PRIORITY_CONFIG[task.priority];
  const notInvited = staffList.filter(e => !task.members.some(m => m.id === e.id));
  const talkHref = task.channelId && task.talkId ? `/tasks/channels/${task.channelId}/talks/${task.talkId}` : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      <div className="max-w-5xl mx-auto w-full px-4 py-4 flex flex-col lg:flex-row gap-4 flex-1">
        <div className="flex-1 flex flex-col min-h-0 gap-3">

          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <button onClick={() => setDetailOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <span className="text-sm font-bold text-gray-800 truncate">{task.title}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${pri.color}`}>{pri.label}優先</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${task.type === "personal" ? "bg-indigo-50 text-indigo-600" : "bg-teal-50 text-teal-600"}`}>
                  {task.type === "personal" ? "個人" : "組織"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <button onClick={e => { e.stopPropagation(); setShowEdit(true); }}
                  className="text-xs text-gray-400 hover:text-emerald-600 transition px-2 py-1 rounded-lg hover:bg-emerald-50 border border-transparent hover:border-emerald-200">
                  編集
                </button>
                <span className="text-gray-400 text-xs">{detailOpen ? "▲ 閉じる" : "▼ 詳細"}</span>
              </div>
            </button>
            {detailOpen && (
              <div className="px-4 pb-4 border-t pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><p className="text-xs text-gray-400 mb-0.5">期日</p><p className="text-sm font-semibold text-gray-700">{formatDeadline(task.deadline)}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">チャンネル</p><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{task.category}</span></div>
                <div><p className="text-xs text-gray-400 mb-0.5">作成者</p><p className="text-sm text-gray-700">{task.ownerName}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">作成日</p><p className="text-xs text-gray-600">{fmtD(task.createdAt)}</p></div>
                {task.talkName && (
                  <div className="col-span-2 sm:col-span-4">
                    <p className="text-xs text-gray-400 mb-0.5">発生元トーク</p>
                    {talkHref ? (
                      <Link href={talkHref} className="text-sm text-emerald-600 font-medium hover:underline"># {task.talkName}</Link>
                    ) : (
                      <span className="text-sm text-gray-600"># {task.talkName}</span>
                    )}
                  </div>
                )}
                {task.description && (
                  <div className="col-span-2 sm:col-span-4">
                    <p className="text-xs text-gray-400 mb-0.5">詳細</p>
                    <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ height: "540px" }}>
            <div className="border-b px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-bold text-gray-700">スレッド</span>
              {task.messages.length > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">{task.messages.length}</span>
              )}
              {searchQuery && filteredThreads.length !== threads.length && (
                <span className="text-xs text-amber-600 font-bold">{filteredThreads.length}件ヒット</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {showSearch ? (
                  <div className="flex items-center gap-1">
                    <input ref={searchRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="メッセージを検索..."
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    <button onClick={() => { setShowSearch(false); setSearchQuery(""); }}
                      className="text-gray-400 hover:text-gray-600 text-xs">×</button>
                  </div>
                ) : (
                  <button onClick={() => setShowSearch(true)}
                    className="text-xs text-gray-400 hover:text-emerald-600 transition flex items-center gap-1">
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="9" cy="9" r="6"/><path d="M15 15l-3-3" strokeLinecap="round"/>
                    </svg>
                    検索
                  </button>
                )}
                <span className="text-xs text-gray-400">メンバー {task.members.length}名</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredThreads.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  {searchQuery
                    ? <><p className="text-sm font-medium">「{searchQuery}」に一致するメッセージがありません</p><button onClick={() => setSearchQuery("")} className="text-xs text-emerald-600 mt-2 hover:underline">検索をクリア</button></>
                    : <><p className="text-sm font-medium">まだメッセージがありません</p><p className="text-xs mt-1">件名と宛先を選んで最初のメッセージを送りましょう</p></>
                  }
                </div>
              )}
              {filteredThreads.map((thread, i) => (
                <ThreadCard
                  key={thread.root.id}
                  thread={thread}
                  allMessages={task.messages}
                  me={me}
                  query={searchQuery}
                  onToggleReaction={handleToggleReaction}
                  onReply={setReplyTo}
                  onDelete={handleDeleteThread}
                  defaultOpen={i === filteredThreads.length - 1}
                />
              ))}
              <div ref={bottomRef} />
            </div>

            <ComposePanel members={task.members} me={me} replyTo={replyTo} onSend={handleSend} onCancelReply={() => setReplyTo(null)} />
          </div>
        </div>

        <div className="w-full lg:w-72 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">ステータス変更</p>
            <div className="space-y-2">
              {STATUS_OPTIONS.map(opt => {
                const c = STATUS_CONFIG[opt.value];
                const active = task.status === opt.value;
                return (
                  <button key={opt.value} onClick={() => handleStatusChange(opt.value)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${active ? `${c.bg} ${c.border} ${c.text}` : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                    {opt.label}
                    {active && <span className="ml-auto text-xs">現在</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">メンバー ({task.members.length})</p>
              {notInvited.length > 0 && (
                <button onClick={() => setShowInvite(!showInvite)} className="text-xs text-emerald-600 font-bold hover:underline">+ 招待</button>
              )}
            </div>
            <div className="space-y-2">
              {task.members.map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{m.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.role === "owner" ? "オーナー" : m.role === "assignee" ? "担当者" : "閲覧者"}</p>
                  </div>
                  {m.role !== "owner" && (
                    <button onClick={() => handleRemoveMember(m.id, m.name)} className="text-xs text-gray-300 hover:text-rose-400 transition">×</button>
                  )}
                </div>
              ))}
            </div>
            {showInvite && notInvited.length > 0 && (
              <div className="mt-3 pt-3 border-t space-y-1.5">
                <p className="text-xs text-gray-400 mb-2">招待できるメンバー</p>
                {notInvited.map(emp => (
                  <button key={emp.id} onClick={() => { handleInvite(emp); setShowInvite(false); }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-emerald-50 text-left transition">
                    <div className="w-7 h-7 rounded-full bg-indigo-400 flex items-center justify-center text-white text-xs font-bold">{emp.name.charAt(0)}</div>
                    <div>
                      <p className="text-xs font-medium text-gray-700">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.department}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">クイックアクション</p>
            {[
              { label: "進捗を報告する",    subject: "進捗報告",   text: "進捗を共有します。現在対応中です。引き続きよろしくお願いします。", style: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" },
              { label: "サポートを依頼する", subject: "サポート依頼", text: "対応に困っている点があります。サポートをお願いできますか？", style: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" },
              { label: "完了として報告する", subject: "完了報告",   text: "タスクが完了しました。ご確認をお願いします。", style: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
            ].map(action => (
              <button key={action.label}
                onClick={async () => {
                  if (action.label === "完了として報告する") await handleStatusChange("completed");
                  const u = await apiAddMessage(task.id, { subject: action.subject, toIds: ["all"], toNames: ["全員"], text: action.text });
                  if (u) { setTask(u); showToast(`${action.label}を送信しました`); }
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${action.style}`}>
                {action.label}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
            <p className="text-xs font-bold text-amber-500 uppercase tracking-wide mb-3">タスクのアーカイブ</p>
            <button onClick={handleDeleteTask}
              className="w-full text-center px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-bold hover:bg-amber-100 transition">
              アーカイブに移動する
            </button>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">アーカイブしたタスクは一覧から非表示になりますが、アーカイブ画面から閲覧・復旧・完全削除できます。</p>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-5 py-3 rounded-full shadow-lg">
          {toast}
        </div>
      )}
      {showEdit && task && (
        <TaskEditModal task={task} onSave={handleTaskSave} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}
