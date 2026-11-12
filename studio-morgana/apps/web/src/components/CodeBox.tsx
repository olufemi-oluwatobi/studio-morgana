// The godtongue box: a textarea whose text is transparent, over a coloured copy of the same text, line marks
// (changed, error) and line numbers. The layers follow the textarea's scroll by transform, without re-rendering.
import { forwardRef, memo, useImperativeHandle, useMemo, useRef, type KeyboardEvent } from 'react';
import { tokens } from '../lib/gt-highlight';

export interface CodeBoxHandle { goToLine(n: number): void }
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
}>(function CodeBox({ value, onChange, onRun, changed, errors, disabled }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => value.split('\n'), [value]);

  useImperativeHandle(ref, () => ({
    goToLine(n: number) {
      const t = ta.current; if (!t) return;
      const ls = t.value.split('\n');
      const start = ls.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
      t.focus(); t.setSelectionRange(start, start + (ls[n - 1]?.length ?? 0));
      t.scrollTop = Math.max(0, (n - 4) * LH);
      onScroll();
    },
  }), []);

  const onScroll = () => {
    const t = ta.current; if (!t) return;
    if (layer.current) layer.current.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
    if (gutter.current) gutter.current.style.transform = `translateY(${-t.scrollTop}px)`;
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      <div className="code-body">
        <div ref={layer} className="code-layer" aria-hidden="true">
          {[...changed].map((n) => <div key={'c' + n} className="mark changed" style={{ top: (n - 1) * LH }} />)}
          {[...errors].map((n) => <div key={'e' + n} className="mark error" style={{ top: (n - 1) * LH }} />)}
          <div className="code-hl">{lines.map((l, i) => <Line key={i} text={l} />)}</div>
        </div>
        <textarea ref={ta} value={value} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={disabled}
          aria-label="Godtongue source" onChange={(e) => onChange(e.target.value)} onScroll={onScroll} onKeyDown={onKey} wrap="off" />
      </div>
    </div>
  );
}));
