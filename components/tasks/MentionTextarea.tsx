"use client";

import { useRef, useState, type KeyboardEvent, type ClipboardEvent, type UIEvent } from "react";
import { renderComposerMessage } from "@/lib/messageFormat";
import { ALL_MENTION_ID, ALL_MENTION_NAME } from "@/lib/mentions";

type Member = { id: string; name: string };

/** 「@全員」仮想メンバー */
const ALL_MEMBER: Member = { id: ALL_MENTION_ID, name: ALL_MENTION_NAME };

/**
 * @メンション用のオートコンプリート付きテキストエリア。
 * 「@」を入力するとトークルームのメンバー候補を表示し、選択すると本文に「@表示名 」を挿入する。
 * 名前に空白を含む場合も表示名そのものを挿入するため、後段のメンション解析と整合する。
 */
export default function MentionTextarea({
  value,
  onChange,
  members,
  placeholder,
  rows = 3,
  className = "",
  autoFocus = false,
  onSubmit,
  onEscape,
  onImageFiles,
  showToolbar = false,
  meId = "",
}: {
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  onEscape?: () => void;
  onImageFiles?: (files: File[]) => void;
  showToolbar?: boolean;
  meId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [atIndex, setAtIndex] = useState(-1);
  const [active, setActive] = useState(0);

  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

  // 候補リスト: 先頭に「@全員」、その後に個人メンバーを表示
  const suggestions = open
    ? (() => {
        const q = norm(query);
        const allMatch =
          q === "" ||
          "全員".includes(q) ||
          "all".includes(q) ||
          "ぜんいん".includes(q);
        const personalMatches = members
          .filter((m) => m.id !== ALL_MENTION_ID && (q === "" || norm(m.name).includes(q)))
          .slice(0, 7);
        const result: Member[] = [];
        if (allMatch) result.push(ALL_MEMBER);
        result.push(...personalMatches);
        return result.slice(0, 8);
      })()
    : [];

  const detect = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) {
      setOpen(false);
      return;
    }
    const prev = at > 0 ? before[at - 1] : "";
    if (prev && !/\s/.test(prev)) {
      setOpen(false);
      return;
    }
    const q = before.slice(at + 1);
    if (/\n/.test(q) || q.length > 20) {
      setOpen(false);
      return;
    }
    setAtIndex(at);
    setQuery(q);
    setActive(0);
    setOpen(true);
  };

  const insert = (m: Member) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const start = atIndex >= 0 ? atIndex : caret;
    const before = value.slice(0, start);
    const after = value.slice(caret);
    const insertText = `@${m.name} `;
    const next = before + insertText + after;
    onChange(next);
    setOpen(false);
    const pos = before.length + insertText.length;
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insert(suggestions[active] ?? suggestions[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (e.key === "Escape") {
      onEscape?.();
    }
  };

  // ---- 書式ツールバー操作 ----
  const applyWrap = (token: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const ei = el.selectionEnd ?? 0;
    const sel = value.slice(s, ei) || "テキスト";
    const next = value.slice(0, s) + token + sel + token + value.slice(ei);
    onChange(next);
    const start = s + token.length;
    const end = start + sel.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, end);
    });
  };

  const applyHeading = (hashes: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    let lineEnd = value.indexOf("\n", s);
    if (lineEnd === -1) lineEnd = value.length;
    const line = value.slice(lineStart, lineEnd).replace(/^#{1,6}\s+/, "");
    const inserted = `${hashes} ${line}`;
    const next = value.slice(0, lineStart) + inserted + value.slice(lineEnd);
    onChange(next);
    const pos = lineStart + inserted.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const applyList = (ordered: boolean) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const ei = el.selectionEnd ?? 0;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    let lineEnd = value.indexOf("\n", ei);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd);
    const transformed = block
      .split("\n")
      .map((ln, idx) => {
        const stripped = ln.replace(/^(\s*)([-*]\s+|\d+\.\s+)/, "$1");
        return ordered ? `${idx + 1}. ${stripped}` : `- ${stripped}`;
      })
      .join("\n");
    const next = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
    onChange(next);
    const pos = lineStart + transformed.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart, pos);
    });
  };

  const insertHr = () => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? value.length;
    const needNlBefore = s > 0 && value[s - 1] !== "\n";
    const ins = `${needNlBefore ? "\n" : ""}---\n`;
    const next = value.slice(0, s) + ins + value.slice(s);
    onChange(next);
    const pos = s + ins.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onImageFiles) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      onImageFiles(files);
    }
  };

  // 装飾オーバーレイ（背景div）とtextareaのスクロール位置を同期
  const backdropRef = useRef<HTMLDivElement>(null);
  const syncScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (backdropRef.current) {
      backdropRef.current.scrollTop = el.scrollTop;
      backdropRef.current.scrollLeft = el.scrollLeft;
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      {showToolbar && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {[
            { label: "見出し大", title: "見出し（大）", fn: () => applyHeading("#"), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-sm font-bold hover:border-emerald-500 hover:text-white" },
            { label: "見出し中", title: "小見出し（中）", fn: () => applyHeading("##"), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs font-bold hover:border-emerald-500 hover:text-white" },
            { label: "B", title: "太字", fn: () => applyWrap("**"), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs font-bold hover:border-emerald-500 hover:text-white" },
            { label: "マーカー", title: "マーカー（ハイライト）", fn: () => applyWrap("=="), cls: "border-yellow-400 bg-yellow-300 text-zinc-900 text-xs hover:bg-yellow-200" },
            { label: "1.", title: "番号リスト", fn: () => applyList(true), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs hover:border-emerald-500 hover:text-white" },
            { label: "•", title: "箇条書き", fn: () => applyList(false), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs hover:border-emerald-500 hover:text-white" },
            { label: "─", title: "水平線", fn: insertHr, cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs hover:border-emerald-500 hover:text-white" },
          ].map((b) => (
            <button
              key={b.title}
              type="button"
              title={b.title}
              onMouseDown={(e) => {
                e.preventDefault();
                b.fn();
              }}
              className={`min-w-7 h-7 px-2 rounded-md border transition ${b.cls}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        {/* 装飾オーバーレイ：textarea の文字は透明にし、背後の div に装飾済みテキストを表示する。
            文字位置を変えないためキャレットと描画がずれない。 */}
        <div
          ref={backdropRef}
          aria-hidden
          className={`${className} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words`}
        >
          {renderComposerMessage(value, members, meId)}
          {value.endsWith("\n") ? "\n" : ""}
        </div>
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            detect(e.target);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => detect(e.currentTarget)}
          onClick={(e) => detect(e.currentTarget)}
          onPaste={onPaste}
          onScroll={syncScroll}
          rows={rows}
          placeholder={placeholder}
          className={`${className} relative selection:bg-emerald-200/70`}
          style={
            value
              ? { background: "transparent", color: "transparent", WebkitTextFillColor: "transparent", caretColor: "#1f2937" }
              : { background: "transparent", caretColor: "#1f2937" }
          }
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1 z-50 w-64 max-h-56 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl py-1">
          {suggestions.map((m, i) => {
            const isAll = m.id === ALL_MENTION_ID;
            return (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(m);
                }}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                  i === active ? "bg-emerald-600/30 text-white" : "text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    isAll ? "bg-sky-500" : "bg-emerald-500"
                  }`}
                >
                  {isAll ? "All" : m.name.charAt(0)}
                </span>
                <span className="truncate">
                  {isAll ? (
                    <>
                      <span className="font-bold">@全員</span>
                      <span className="text-zinc-400 text-xs ml-1">- 参加者全員にメンション</span>
                    </>
                  ) : (
                    m.name
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
