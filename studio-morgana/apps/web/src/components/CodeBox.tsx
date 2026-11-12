// The godtongue box: a plain textarea over a layer that marks changed lines and lines with errors.
import { forwardRef, memo, useImperativeHandle, useRef, type KeyboardEvent } from 'react';

export interface CodeBoxHandle { goToLine(n: number): void }
const LH = 20; // line height in px, shared with the CSS

export const CodeBox = memo(forwardRef<CodeBoxHandle, {
  value: string; onChange(v: string): void; onRun(): void; changed: ReadonlySet<number>; errors: ReadonlySet<number>; disabled?: boolean;
}>(function CodeBox({ value, onChange, onRun, changed, errors, disabled }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split('\n').length;

  useImperativeHandle(ref, () => ({
    goToLine(n: number) {
      const t = ta.current; if (!t) return;
      const ls = t.value.split('\n');
      const start = ls.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
      t.focus(); t.setSelectionRange(start, start + (ls[n - 1]?.length ?? 0));
      t.scrollTop = Math.max(0, (n - 4) * LH);
    },
  }), []);

  // keep the marks and the line numbers under the text as it scrolls, without re-rendering
  const onScroll = () => {
    const t = ta.current; if (!t) return;
    const y = `translateY(${-t.scrollTop}px)`;
    if (marks.current) marks.current.style.transform = `${y} translateX(${-t.scrollLeft}px)`;
    if (gutter.current) gutter.current.style.transform = y;
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
      <div className="code-gutter" aria-hidden="true"><div ref={gutter}>{Array.from({ length: lines }, (_, i) => <div key={i} className={errors.has(i + 1) ? 'err' : ''}>{i + 1}</div>)}</div></div>
      <div className="code-body">
        <div ref={marks} className="code-marks" aria-hidden="true">
          {[...changed].map((n) => <div key={'c' + n} className="mark changed" style={{ top: (n - 1) * LH }} />)}
          {[...errors].map((n) => <div key={'e' + n} className="mark error" style={{ top: (n - 1) * LH }} />)}
        </div>
        <textarea ref={ta} value={value} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={disabled}
          aria-label="Godtongue source" onChange={(e) => onChange(e.target.value)} onScroll={onScroll} onKeyDown={onKey} wrap="off" />
      </div>
    </div>
  );
}));
