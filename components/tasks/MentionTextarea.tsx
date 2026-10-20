"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { markdownToHtml, domToMarkdown } from "@/lib/richText";
import { ALL_MENTION_ID, ALL_MENTION_NAME } from "@/lib/mentions";

type Member = { id: string; name: string };

/** 「@全員」仮想メンバー */
const ALL_MEMBER: Member = { id: ALL_MENTION_ID, name: ALL_MENTION_NAME };

/**
 * リッチテキスト入力エディタ（contentEditable）。
 * 内部データは Markdown-lite 文字列のままやり取りし、表示は装飾済みHTML。
 * 太字・見出し・マーカー・リスト・水平線が入力中にそのまま視覚反映される。
 * 「@」でメンション候補を表示し、選択すると表示名を挿入する。
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
  void meId;
  const ref = useRef<HTMLDivElement>(null);
  const lastSerialized = useRef<string>(value);
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

  // 外部から value が変わった時だけ innerHTML を更新（送信後のクリア等）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastSerialized.current) {
      lastSerialized.current = value;
      el.innerHTML = value ? markdownToHtml(value) : "";
    }
  }, [value]);

  // 初回マウント時に初期値を反映
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value) el.innerHTML = markdownToHtml(value);
    if (autoFocus) {
      el.focus();
      // キャレットを末尾へ
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // キャレット直前のテキスト（同一テキストノード内）を取得
  const getCaretContext = (): { textNode: Text; offset: number; before: string } | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const textNode = node as Text;
    if (!ref.current?.contains(textNode)) return null;
    return { textNode, offset: range.startOffset, before: (textNode.textContent ?? "").slice(0, range.startOffset) };
  };

  const detect = () => {
    const ctx = getCaretContext();
    if (!ctx) {
      setOpen(false);
      return;
    }
    const at = ctx.before.lastIndexOf("@");
    if (at === -1) {
      setOpen(false);
      return;
    }
    const prev = at > 0 ? ctx.before[at - 1] : "";
    if (prev && !/\s/.test(prev)) {
      setOpen(false);
      return;
    }
    const q = ctx.before.slice(at + 1);
    if (/\n/.test(q) || q.length > 20) {
      setOpen(false);
      return;
    }
    setAtIndex(at);
    setQuery(q);
    setActive(0);
    setOpen(true);
  };

  const serialize = () => {
    const el = ref.current;
    if (!el) return;
    const md = domToMarkdown(el);
    if (md === "" && el.innerHTML !== "") el.innerHTML = "";
    lastSerialized.current = md;
    onChange(md);
  };

  const insert = (m: Member) => {
    const ctx = getCaretContext();
    const insertText = `@${m.name} `;
    if (ctx) {
      const tn = ctx.textNode;
      const start = atIndex >= 0 ? atIndex : ctx.offset;
      const text = tn.textContent ?? "";
      tn.textContent = text.slice(0, start) + insertText + text.slice(ctx.offset);
      const pos = start + insertText.length;
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(tn, pos);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      document.execCommand("insertText", false, insertText);
    }
    setOpen(false);
    ref.current?.focus();
    serialize();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
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

  // ---- 書式ツールバー操作（WYSIWYG: 選択範囲に直接適用） ----
  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    serialize();
  };

  const applyHeading = (tag: "h1" | "h2") => {
    ref.current?.focus();
    const current = document.queryCommandValue("formatBlock");
    document.execCommand("formatBlock", false, current === tag ? "div" : tag);
    serialize();
  };

  const applyMarker = () => {
    ref.current?.focus();
    const current = document.queryCommandValue("backColor");
    const isMarked = /253|254|255,\s*2|yellow/i.test(String(current));
    document.execCommand("hiliteColor", false, isMarked ? "transparent" : "#fde047");
    serialize();
  };

  const insertHr = () => {
    ref.current?.focus();
    document.execCommand("insertHTML", false, "<hr>");
    serialize();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0 && onImageFiles) {
      e.preventDefault();
      onImageFiles(files);
      return;
    }
    // リッチテキストの貼り付けはプレーンテキスト化（余計なスタイル混入を防止）
    const text = e.clipboardData?.getData("text/plain");
    if (text) {
      e.preventDefault();
      document.execCommand("insertText", false, text);
      serialize();
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      {showToolbar && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {[
            { label: "見出し大", title: "見出し（大）", fn: () => applyHeading("h1"), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-sm font-bold hover:border-emerald-500 hover:text-white" },
            { label: "見出し中", title: "小見出し（中）", fn: () => applyHeading("h2"), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs font-bold hover:border-emerald-500 hover:text-white" },
            { label: "B", title: "太字", fn: () => exec("bold"), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs font-bold hover:border-emerald-500 hover:text-white" },
            { label: "マーカー", title: "マーカー（ハイライト）", fn: applyMarker, cls: "border-yellow-400 bg-yellow-300 text-zinc-900 text-xs hover:bg-yellow-200" },
            { label: "1.", title: "番号リスト", fn: () => exec("insertOrderedList"), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs hover:border-emerald-500 hover:text-white" },
            { label: "•", title: "箇条書き", fn: () => exec("insertUnorderedList"), cls: "border-zinc-700 bg-zinc-800 text-zinc-200 text-xs hover:border-emerald-500 hover:text-white" },
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
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={() => {
          serialize();
          detect();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={detect}
        onClick={detect}
        onPaste={onPaste}
        className={`${className} overflow-y-auto outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:pointer-events-none [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_hr]:my-2 [&_hr]:border-t [&_hr]:border-zinc-400 [&_mark]:bg-yellow-300/80 [&_mark]:text-zinc-900 [&_mark]:rounded [&_mark]:px-0.5 [&_code]:bg-gray-200 [&_code]:text-pink-600 [&_code]:rounded [&_code]:px-1 [&_code]:text-[0.85em] [&_code]:font-mono`}
        style={{ minHeight: `${rows * 1.5}rem` }}
      />
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
