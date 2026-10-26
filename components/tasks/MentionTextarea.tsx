"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { markdownToHtml, domToMarkdown, MENTION_LEAK_COLOR_RE, MENTION_LEAK_BG_RE } from "@/lib/richText";
import { ALL_MENTION_ID, ALL_MENTION_NAME } from "@/lib/mentions";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Highlighter,
  Baseline,
  ALargeSmall,
  Minus,
} from "lucide-react";

type Member = { id: string; name: string };

/** 「@全員」仮想メンバー */
const ALL_MEMBER: Member = { id: ALL_MENTION_ID, name: ALL_MENTION_NAME };

/** ハイライト色パレット（背景色） */
const HIGHLIGHT_COLORS = [
  "#fda4af", "#fdba74", "#fde047", "#bef264",
  "#86efac", "#5eead4", "#93c5fd", "#d8b4fe",
];

/** 文字色パレット */
const FONT_COLORS = [
  "#e11d48", "#ea580c", "#ca8a04", "#65a30d",
  "#16a34a", "#0d9488", "#2563eb", "#9333ea",
];

/** 文字サイズ（execCommand fontSize 1-7） */
const FONT_SIZES = [
  { label: "Large", size: "5" },
  { label: "Medium", size: "4" },
  { label: "Small", size: "2" },
] as const;

/**
 * リッチテキスト入力エディタ（contentEditable / Slack風ツールバー）。
 * 内部データは Markdown-lite 文字列のままやり取りし、表示は装飾済みHTML。
 * B/I/U/S・箇条書き・番号リスト・ハイライト色・文字色・文字サイズ・水平線が
 * 入力中にそのまま視覚反映される。
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
  const [popup, setPopup] = useState<"highlight" | "color" | "size" | null>(null);
  const savedRange = useRef<Range | null>(null);

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

  /**
   * contenteditable のスタイル継承により、メンション装飾（.kt-mention-live）の
   * 色・背景が直後に入力したテキストへ inline style として漏れることがある。
   * 漏れたスタイルはパレットに存在しない色で一意に識別できるため、
   * .kt-mention-live 以外の要素から該当プロパティを除去する。
   * （テキストノードや構造は触らないのでキャレット位置は維持される）
   */
  const stripLeakedMentionStyles = () => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>("span, font, b, strong, i, em, u, s").forEach((node) => {
      if (node.classList.contains("kt-mention-live")) return;
      let touched = false;
      if (node.style.color && MENTION_LEAK_COLOR_RE.test(node.style.color)) {
        node.style.color = "";
        touched = true;
      }
      if (node.style.backgroundColor && MENTION_LEAK_BG_RE.test(node.style.backgroundColor)) {
        node.style.backgroundColor = "";
        touched = true;
      }
      if (node.tagName.toLowerCase() === "font") {
        const c = (node as HTMLFontElement).color;
        if (c && MENTION_LEAK_COLOR_RE.test(c)) {
          (node as HTMLFontElement).removeAttribute("color");
          touched = true;
        }
      }
      if (!touched) return;
      // 漏れは color/背景/font-weight がセットで複製されるため、太字も併せて除去する
      // （ユーザーが意図した太字のみの要素は color/背景を含まないので影響しない）
      const fw = node.style.fontWeight;
      if (fw === "bold" || Number(fw) >= 600) node.style.fontWeight = "";
      if (node.getAttribute("style") === "") node.removeAttribute("style");
    });
  };

  // ---- 入力中メンションのライブ装飾 ----
  // ノード全体のテキストオフセットを計算（キャレット復元用）
  const textOffsetOf = (root: Node, node: Node, offset: number): number => {
    let count = 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let cur = walk.nextNode();
    while (cur) {
      if (cur === node) return count + offset;
      count += (cur.textContent ?? "").length;
      cur = walk.nextNode();
    }
    return -1;
  };

  const setCaretAtOffset = (root: Node, offset: number) => {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let cur = walk.nextNode();
    let count = 0;
    while (cur) {
      const len = (cur.textContent ?? "").length;
      if (count + len >= offset) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(cur, offset - count);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      count += len;
      cur = walk.nextNode();
    }
  };

  // すでにメンション装飾スパン内か
  const inMentionSpan = (node: Node): boolean => {
    let p: Node | null = node.parentNode;
    while (p && p !== ref.current) {
      if (p instanceof HTMLElement && p.classList.contains("kt-mention-live")) return true;
      p = p.parentNode;
    }
    return false;
  };

  /**
   * 手入力で「@名前 」(完全一致 + 区切りの空白) が完成した瞬間に着色する。
   * 名前に空白を含むメンバー（例: 「田中 花子」）にも対応するため、
   * キャレット直前の空白まで遡って最後の「@」を探し、そこから空白までの
   * 文字列がメンバー名と完全一致した場合に装飾する。
   * 装飾は表示専用（className のみ）で、シリアライズ結果は変わらない。
   */
  const decorateLiveMention = () => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const tn = node as Text;
    if (!el.contains(tn) || inMentionSpan(tn)) return;
    const caret = range.startOffset;
    const text = tn.textContent ?? "";
    if (caret > text.length) return;
    const before = text.slice(0, caret);
    // 直近の入力が区切りの空白であること（contenteditableでは末尾空白が&nbsp;に置換される点に注意）
    if (!/[ \u3000\xa0]$/.test(before)) return;
    const atSearch = before.slice(0, before.length - 1);
    // 最大30文字まで遡って最後の「@」を探す
    let atIdx = -1;
    for (let i = atSearch.length - 1; i >= Math.max(0, atSearch.length - 30); i--) {
      if (atSearch[i] === "@") {
        atIdx = i;
        break;
      }
    }
    if (atIdx === -1) return;
    // 「@」の直前は先頭 or 空白であること（メールアドレス等の誤検知防止）
    if (atIdx > 0 && !/\s/.test(atSearch[atIdx - 1])) return;
    const name = atSearch.slice(atIdx + 1);
    if (!name) return;
    const isAll = name === ALL_MENTION_NAME;
    if (!isAll && !members.some((x) => x.name === name)) return;
    const start = atIdx;
    if (start < 0) return;
    const caretOff = textOffsetOf(el, tn, caret);
    try {
      const wrapRange = document.createRange();
      wrapRange.setStart(tn, start);
      wrapRange.setEnd(tn, start + 1 + name.length);
      const span = document.createElement("span");
      span.className = isAll ? "kt-mention-live kt-mention-all" : "kt-mention-live";
      wrapRange.surroundContents(span);
      if (caretOff >= 0) setCaretAtOffset(el, caretOff);
      serialize();
    } catch {
      /* 装飾できない場合はそのまま */
    }
  };

  const insert = (m: Member) => {
    const ctx = getCaretContext();
    const insertText = `@${m.name} `;
    if (ctx) {
      const tn = ctx.textNode;
      const start = atIndex >= 0 ? atIndex : ctx.offset;
      const text = tn.textContent ?? "";
      tn.textContent = text.slice(0, start) + insertText + text.slice(ctx.offset);
      // メンション部分（@名前 のみ。末尾の空白は含めない）を着色スパンで包む
      const mentionEnd = start + insertText.length - 1;
      try {
        const wrapRange = document.createRange();
        wrapRange.setStart(tn, start);
        wrapRange.setEnd(tn, mentionEnd);
        const span = document.createElement("span");
        span.className = m.id === ALL_MENTION_ID ? "kt-mention-live kt-mention-all" : "kt-mention-live";
        wrapRange.surroundContents(span);
        // キャレットは末尾（空白の後）へ
        const rest = span.nextSibling;
        const sel = window.getSelection();
        const range = document.createRange();
        if (rest && rest.nodeType === Node.TEXT_NODE) {
          range.setStart(rest as Text, 1);
        } else {
          range.setStartAfter(span);
        }
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        // 包めない場合は従来通りキャレットを末尾へ
        const pos = start + insertText.length;
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(tn, pos);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
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
  // ポップアップを開く前に選択範囲を保存（ポップアップ操作でフォーカスが外れるため）
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.getRangeAt(0).startContainer)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    ref.current?.focus();
    if (savedRange.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    serialize();
  };

  const applyHighlight = (color: string | null) => {
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("hiliteColor", false, color ?? "transparent");
    saveSelection();
    serialize();
    setPopup(null);
  };

  const applyFontColor = (color: string | null) => {
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    // 自動 = エディタ既定色（#1f2937）。シリアライズ時に既定色は除去される。
    document.execCommand("foreColor", false, color ?? "#1f2937");
    saveSelection();
    serialize();
    setPopup(null);
  };

  const applyFontSize = (size: string) => {
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontSize", false, size);
    saveSelection();
    serialize();
    setPopup(null);
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

  const iconBtn =
    "w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition";
  const togglePopup = (p: "highlight" | "color" | "size") => {
    saveSelection();
    setPopup((cur) => (cur === p ? null : p));
  };

  return (
    <div className="relative flex-1 min-w-0">
      {showToolbar && (
        <div className="relative mb-1.5 flex items-center gap-0.5 rounded-lg border border-gray-300 bg-white px-1.5 py-1 w-fit">
          <button type="button" title="太字（⌘B）" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} className={iconBtn}>
            <Bold size={15} strokeWidth={2.5} />
          </button>
          <button type="button" title="斜体（⌘I）" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} className={iconBtn}>
            <Italic size={15} />
          </button>
          <button type="button" title="下線（⌘U）" onMouseDown={(e) => { e.preventDefault(); exec("underline"); }} className={iconBtn}>
            <Underline size={15} />
          </button>
          <button type="button" title="取り消し線" onMouseDown={(e) => { e.preventDefault(); exec("strikeThrough"); }} className={iconBtn}>
            <Strikethrough size={15} />
          </button>
          <span className="mx-1 h-4 w-px bg-gray-300" />
          <button type="button" title="箇条書き" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }} className={iconBtn}>
            <List size={15} />
          </button>
          <button type="button" title="番号付きリスト" onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }} className={iconBtn}>
            <ListOrdered size={15} />
          </button>
          <span className="mx-1 h-4 w-px bg-gray-300" />
          <button
            type="button"
            title="ハイライト色"
            onMouseDown={(e) => { e.preventDefault(); togglePopup("highlight"); }}
            className={`${iconBtn} ${popup === "highlight" ? "bg-gray-200 text-gray-800" : ""}`}
          >
            <Highlighter size={15} />
          </button>
          <button
            type="button"
            title="文字色"
            onMouseDown={(e) => { e.preventDefault(); togglePopup("color"); }}
            className={`${iconBtn} ${popup === "color" ? "bg-gray-200 text-gray-800" : ""}`}
          >
            <Baseline size={15} />
          </button>
          <button
            type="button"
            title="文字サイズ"
            onMouseDown={(e) => { e.preventDefault(); togglePopup("size"); }}
            className={`${iconBtn} ${popup === "size" ? "bg-gray-200 text-gray-800" : ""}`}
          >
            <ALargeSmall size={15} />
          </button>
          <span className="mx-1 h-4 w-px bg-gray-300" />
          <button type="button" title="水平線" onMouseDown={(e) => { e.preventDefault(); insertHr(); }} className={iconBtn}>
            <Minus size={15} />
          </button>

          {/* ハイライト色パレット */}
          {popup === "highlight" && (
            <div className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-gray-300 bg-white shadow-xl p-2 w-40">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applyHighlight(null); }}
                className="w-full mb-1.5 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                ハイライトなし
              </button>
              <div className="grid grid-cols-4 gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onMouseDown={(e) => { e.preventDefault(); applyHighlight(c); }}
                    className="w-7 h-7 rounded-md border border-black/10 hover:scale-110 transition"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 文字色パレット */}
          {popup === "color" && (
            <div className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-gray-300 bg-white shadow-xl p-2 w-40">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applyFontColor(null); }}
                className="w-full mb-1.5 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                自動
              </button>
              <div className="grid grid-cols-4 gap-1.5">
                {FONT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onMouseDown={(e) => { e.preventDefault(); applyFontColor(c); }}
                    className="w-7 h-7 rounded-md border border-black/10 hover:scale-110 transition"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 文字サイズ */}
          {popup === "size" && (
            <div className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-gray-300 bg-white shadow-xl py-1 w-28">
              {FONT_SIZES.map((s) => (
                <button
                  key={s.size}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); applyFontSize(s.size); }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
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
          stripLeakedMentionStyles();
          serialize();
          detect();
          decorateLiveMention();
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
