// The godtongue box: a textarea whose text is transparent, over a coloured copy of the same text, line marks
// (changed, error) and line numbers. The layers follow the textarea's scroll by transform, without re-rendering.
import { forwardRef, memo, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { tokens } from '../lib/gt-highlight';
import type { Diagnostic } from '../render/compiler';

export interface CodeBoxHandle { goToLine(n: number): void; replace(r: { line: number; col: number; len: number }, text: string): void }
// where the pointer is in the text, for hover cards: the line (1-based), the column, and how to find a word's place on screen
export interface Point { line: number; col: number; rect(from: number, to: number): { left: number; top: number; right: number; bottom: number } }
const LH = 20; // line height in px, shared with the CSS

const Line = memo(function Line({ text }: { text: string }) {
  const ts = tokens(text);
  return (
    <div className="ln">
      {ts.length ? ts.map((t, i) => (t.k === 'hex'
        ? <span key={i} className="t-hex" style={{ textDecorationColor: t.t }}>{t.t}</span>
        : t.k ? <span key={i} className={'t-' + t.k}>{t.t}</span> : t.t)) : '​'}
    </div>
  );
});

export const CodeBox = memo(forwardRef<CodeBoxHandle, {
  value: string; onChange(v: string): void; onRun(): void; changed: ReadonlySet<number>; errors: ReadonlySet<number>; disabled?: boolean;
  marks?: Diagnostic[]; onPoint?(p: Point | null): void;
}>(function CodeBox({ value, onChange, onRun, changed, errors, disabled, marks, onPoint }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => value.split('\n'), [value]);
  const body = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [cw, setCw] = useState(7.5);                    // width of one character: the font is monospaced
  useLayoutEffect(() => { const w = probe.current?.getBoundingClientRect().width; if (w) setCw(w / 20); }, []);
  const raf = useRef(0);

  useImperativeHandle(ref, () => ({
    goToLine(n: number) {
      const t = ta.current; if (!t) return;
      const ls = t.value.split('\n');
      const start = ls.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
      t.focus(); t.setSelectionRange(start, start + (ls[n - 1]?.length ?? 0));
      t.scrollTop = Math.max(0, (n - 4) * LH);
      onScroll();
    },
    replace(r, text) {
      const t = ta.current; if (!t) return;
      const ls = t.value.split('\n');
      const start = ls.slice(0, r.line - 1).reduce((s, l) => s + l.length + 1, 0) + r.col - 1;
      t.setRangeText(text, start, start + r.len, 'end');
      onChange(t.value); t.focus();
    },
  }), []);

  const onScroll = () => {
    const t = ta.current; if (!t) return;
    onPoint?.(null);
    if (layer.current) layer.current.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
    if (gutter.current) gutter.current.style.transform = `translateY(${-t.scrollTop}px)`;
  };
  const onMove = (e: MouseEvent) => {
    if (!onPoint) return;
    if (e.buttons) { onPoint(null); return; }                                  // selecting text
    const x = e.clientX, y = e.clientY;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const b = body.current, t = ta.current; if (!b || !t) return;
      const r = b.getBoundingClientRect();
      const line = Math.floor((y - r.top - 12 + t.scrollTop) / LH), col = Math.floor((x - r.left - 4 + t.scrollLeft) / cw);
      if (line < 0 || line >= lines.length || col < 0 || col >= lines[line].length) { onPoint(null); return; }
      onPoint({ line: line + 1, col, rect: (from, to) => ({ left: r.left + 4 + from * cw - t.scrollLeft, right: r.left + 4 + to * cw - t.scrollLeft, top: r.top + 12 + line * LH - t.scrollTop, bottom: r.top + 12 + (line + 1) * LH - t.scrollTop }) });
    });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onPoint?.(null);
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onRun(); return; }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const t = e.currentTarget, s = t.selectionStart;
      t.setRangeText('  ', s, t.selectionEnd, 'end');
      onChange(t.value);
    }
  };

  return (
    <div className="code">
      <div className="code-gutter" aria-hidden="true">
        <div ref={gutter}>{lines.map((_, i) => <div key={i} className={errors.has(i + 1) ? 'err' : changed.has(i + 1) ? 'chg' : ''}>{i + 1}</div>)}</div>
      </div>
      <div className="code-body" ref={body} onMouseMove={onMove} onMouseLeave={() => { cancelAnimationFrame(raf.current); onPoint?.(null); }}>
        <span ref={probe} className="code-probe" aria-hidden="true">{'0'.repeat(20)}</span>
        <div ref={layer} className="code-layer" aria-hidden="true">
          {[...changed].map((n) => <div key={'c' + n} className="mark changed" style={{ top: (n - 1) * LH }} />)}
          {[...errors].map((n) => <div key={'e' + n} className="mark error" style={{ top: (n - 1) * LH }} />)}
          {marks?.filter((d) => d.range).map((d, i) => (
            <div key={'s' + i} className={'squig ' + (d.level === 'error' ? 'err' : 'warn')} style={{ top: (d.range!.line - 1) * LH + 14, left: 4 + (d.range!.col - 1) * cw, width: Math.max(1, d.range!.len) * cw }} />
          ))}
          <div className="code-hl">{lines.map((l, i) => <Line key={i} text={l} />)}</div>
        </div>
        <textarea ref={ta} value={value} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={disabled}
          aria-label="Godtongue source" onChange={(e) => onChange(e.target.value)} onScroll={onScroll} onKeyDown={onKey} wrap="off" />
      </div>
    </div>
  );
}));
