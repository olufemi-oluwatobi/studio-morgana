// A plain chat with the app's own model service: pick a model, add an image, watch tool calls, download the chat.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, streamLines } from '../lib/api';
import { toast } from '../lib/session';
import { ArrowUp, Download, Plus, X } from '../components/Icons';

interface ModelRow { id: string; vision: boolean | null; free: boolean | null }
interface Step { tool: string; args: unknown; result: string; ms: number }
type Part = { t: string } | { tool: Step };
interface Turn { role: 'user' | 'assistant'; content: string; image?: string; parts?: Part[]; meta?: string; error?: boolean; streaming?: boolean; model?: string }
const textOf = (parts: Part[]) => parts.map((p) => ('t' in p ? p.t : '')).join('');

const load = (k: string) => { try { return localStorage.getItem('chat-' + k) ?? ''; } catch { return ''; } };
const save = (k: string, v: string) => { try { localStorage.setItem('chat-' + k, v); } catch { /* private window */ } };
const secs = (ms: number) => (ms / 1000).toFixed(1) + 's';

async function shrink(file: File, max = 1280): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

const prettyResult = (r: string) => { try { return JSON.stringify(JSON.parse(r), null, 2); } catch { return r; } };
function Tool({ s }: { s: Step }) {
  const args = JSON.stringify(s.args);
  const bad = /^error/i.test(s.result);
  return (
    <details className="chat-tool">
      <summary>
        <span className={'chat-dot' + (bad ? ' bad' : '')} aria-hidden="true" />
        <span className="chat-tool-name">{s.tool}</span>
        <span className="chat-tool-args">{args === '{}' ? '' : args}</span>
        <small>{secs(s.ms)}</small>
      </summary>
      <div><b>Input</b><pre>{JSON.stringify(s.args, null, 2)}</pre><b>Result</b><pre>{prettyResult(s.result)}</pre></div>
    </details>
  );
}

export default function Chat() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [model, setModel] = useState(load('model'));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null), ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<{ models: ModelRow[]; default?: string | null }>('/c-35d0908c0dc5/models').then((r) => {
      setModels(r.models);
      // start on the app's own model (the service may prefix its ids, so a match on the end counts)
      const want = (r.default || '').toLowerCase();
      const hit = r.models.find((m) => m.id === r.default) || r.models.find((m) => m.id.toLowerCase().split('/').pop() === want);
      if (hit) setModel(hit.id);
    }).catch((e) => setListErr((e as Error).message));
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns, busy]);
  useEffect(() => { const t = ta.current; if (!t) return; t.style.height = '0px'; t.style.height = Math.min(t.scrollHeight, 180) + 'px'; }, [text]);


  const stop = useRef<AbortController | null>(null);
  const patchLast = (f: (t: Turn) => Turn) => setTurns((x) => x.map((t, i) => (i === x.length - 1 ? f(t) : t)));

  async function send() {
    const t = text.trim();
    if ((!t && !image) || busy) return;
    if (!model) { toast('Choose a model first'); return; }
    const sent: Turn[] = [...turns, { role: 'user', content: t || 'What is in this image?', image: image ?? undefined }];
    setTurns([...sent, { role: 'assistant', content: '', parts: [], streaming: true, model }]);
    setText(''); const img = image; setImage(null); setBusy(true);
    const ctl = new AbortController(); stop.current = ctl;
    const history = sent.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    try {
      await streamLines('/c-35d0908c0dc5', { model, messages: history, image: img ?? undefined }, (l) => {
        if (typeof l.t === 'string') patchLast((m) => { const ps = [...(m.parts ?? [])]; const last = ps[ps.length - 1]; if (last && 't' in last) ps[ps.length - 1] = { t: last.t + l.t }; else ps.push({ t: l.t }); return { ...m, parts: ps, content: textOf(ps) }; });
        else if (l.tool) patchLast((m) => { const ps = [...(m.parts ?? []), { tool: l.tool as Step }]; return { ...m, parts: ps }; });
        else if (l.done) patchLast((m) => ({ ...m, streaming: false, meta: `${secs(l.done.ms)}${l.done.usage?.prompt || l.done.usage?.completion ? ` · ${l.done.usage.prompt}→${l.done.usage.completion} tokens` : ''}${l.done.noTools ? ' · this model does not take tools' : ''}` }));
        else if (l.error) patchLast((m) => ({ ...m, streaming: false, error: true, meta: `${secs(l.ms ?? 0)}${l.status ? ' · HTTP ' + l.status : ''}`, parts: [...(m.parts ?? []), { t: (m.content ? '\n\n' : '') + l.error }], content: m.content }));
      }, ctl.signal, 60_000);
    } catch (e) {
      const stopped = ctl.signal.aborted && !(e instanceof ApiError);
      patchLast((m) => ({ ...m, streaming: false, error: !stopped, meta: stopped ? 'stopped' : m.meta, parts: stopped ? m.parts : [...(m.parts ?? []), { t: (m.content ? '\n\n' : '') + (e instanceof ApiError ? e.message : 'The request failed') }] }));
    }
    patchLast((m) => (m.streaming ? { ...m, streaming: false } : m));
    stop.current = null; setBusy(false);
  }

  function download() {
    const md = [`# Chat`, `Saved ${new Date().toISOString()}`, '', ...turns.flatMap((t) => [
      t.role === 'user' ? `## You${t.image ? ' (with an image)' : ''}` : `## ${t.model ?? 'Assistant'}${t.error ? ' (error)' : ''}${t.meta ? ' · ' + t.meta : ''}`,
      ...(t.role === 'user' ? [t.content] : (t.parts ?? []).map((p) => ('t' in p ? p.t : `<tool ${p.tool.tool} ${secs(p.tool.ms)}>\ninput: ${JSON.stringify(p.tool.args)}\nresult: ${p.tool.result}\n</tool>`))), '']),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = `chat-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="page chat">
      <header className="chat-bar">
        <select value={model} onChange={(e) => { setModel(e.target.value); save('model', e.target.value); }} aria-label="Model">
          <option value="">{listErr ? 'Models unavailable' : models.length ? 'Choose a model' : 'Loading models…'}</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.id}{m.vision ? ' · images' : ''}{m.free ? ' · free' : ''}</option>)}
        </select>
        <button className="btn small" onClick={download} disabled={!turns.length}><Download size={14} /> Download chat</button>
      </header>
      {listErr && <p className="chat-bad">{listErr}</p>}
      <div className="chat-thread" aria-live="polite">
        {turns.map((t, i) => t.role === 'user' ? (
          <div key={i} className="chat-user">{t.image && <img src={t.image} alt="Attached" />}<p>{t.content}</p></div>
        ) : (
          <div key={i} className={'chat-ai' + (t.error ? ' err' : '')}>
            {t.parts?.map((p, k) => ('t' in p ? <div key={k} className="chat-text">{p.t}</div> : <Tool key={k} s={p.tool} />))}
            {t.streaming && !t.parts?.some((p) => 't' in p ? p.t : false) && !t.parts?.length && <span className="chat-dots" aria-label="Waiting for the model"><i /><i /><i /></span>}
            {t.streaming && !!t.parts?.length && <span className="chat-caret" aria-hidden="true" />}
            {t.meta && <small>{t.meta}</small>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chat-composer">
        {image && <span className="chat-img"><img src={image} alt="Attached" /><button aria-label="Remove image" onClick={() => setImage(null)}><X size={10} /></button></span>}
        <div className="chat-box">
          <button className="chat-round" aria-label="Add an image" onClick={() => file.current?.click()}><Plus size={18} /></button>
          <textarea ref={ta} rows={1} value={text} placeholder="Message" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          {busy
            ? <button className="chat-round go" aria-label="Stop" onClick={() => stop.current?.abort()}><span className="chat-stop" /></button>
            : <button className="chat-round go" aria-label="Send" onClick={() => void send()} disabled={!text.trim() && !image}><ArrowUp size={18} /></button>}
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setImage(await shrink(f)); } catch { toast('That image could not be read'); } }} />
      </div>
    </div>
  );
}
