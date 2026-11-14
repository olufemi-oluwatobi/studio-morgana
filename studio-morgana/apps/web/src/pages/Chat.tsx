// A plain chat with the app's own model service: pick a model, add an image, watch tool calls, download the chat.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/session';
import { ArrowUp, Download, Plus, X } from '../components/Icons';

interface ModelRow { id: string; vision: boolean | null; free: boolean | null }
interface Step { tool: string; args: unknown; result: string; ms: number }
interface Turn { role: 'user' | 'assistant'; content: string; image?: string; steps?: Step[]; meta?: string; error?: boolean; model?: string }
interface ChatOut { ok: boolean; text?: string; steps: Step[]; ms: number; usage?: { prompt: number; completion: number }; error?: string; status?: number; noTools?: boolean; model: string }

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
    api<{ models: ModelRow[] }>('/chat/models').then((r) => setModels(r.models)).catch((e) => setListErr((e as Error).message));
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns, busy]);
  useEffect(() => { const t = ta.current; if (!t) return; t.style.height = '0px'; t.style.height = Math.min(t.scrollHeight, 180) + 'px'; }, [text]);


  async function send() {
    const t = text.trim();
    if ((!t && !image) || busy) return;
    if (!model) { toast('Choose a model first'); return; }
    const next: Turn[] = [...turns, { role: 'user', content: t || 'What is in this image?', image: image ?? undefined }];
    setTurns(next); setText(''); const img = image; setImage(null); setBusy(true);
    try {
      const r = await api<ChatOut>('/chat', { body: { model, messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), image: img ?? undefined } });
      setTurns((x) => [...x, r.ok
        ? { role: 'assistant', content: r.text || '', steps: r.steps, model: r.model, meta: `${secs(r.ms)}${r.usage?.prompt || r.usage?.completion ? ` · ${r.usage.prompt}→${r.usage.completion} tokens` : ''}${r.noTools ? ' · this model does not take tools' : ''}` }
        : { role: 'assistant', content: r.error || 'No answer', steps: r.steps, error: true, model: r.model, meta: `${secs(r.ms)}${r.status ? ' · HTTP ' + r.status : ''}` }]);
    } catch (e) {
      setTurns((x) => [...x, { role: 'assistant', content: e instanceof ApiError ? e.message : 'The request failed', error: true, model }]);
    }
    setBusy(false);
  }

  function download() {
    const md = [`# Chat`, `Saved ${new Date().toISOString()}`, '', ...turns.flatMap((t) => [
      t.role === 'user' ? `## You${t.image ? ' (with an image)' : ''}` : `## ${t.model ?? 'Assistant'}${t.error ? ' (error)' : ''}${t.meta ? ' · ' + t.meta : ''}`,
      ...(t.steps ?? []).map((s) => `<tool ${s.tool} ${secs(s.ms)}>\ninput: ${JSON.stringify(s.args)}\nresult: ${s.result}\n</tool>`),
      t.content, '']),
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
            {t.steps?.map((s, k) => <Tool key={k} s={s} />)}
            <div className="chat-text">{t.content}</div>
            {t.meta && <small>{t.meta}</small>}
          </div>
        ))}
        {busy && <div className="chat-ai"><span className="chat-dots" aria-label="Waiting for the model"><i /><i /><i /></span></div>}
        <div ref={end} />
      </div>
      <div className="chat-composer">
        {image && <span className="chat-img"><img src={image} alt="Attached" /><button aria-label="Remove image" onClick={() => setImage(null)}><X size={10} /></button></span>}
        <div className="chat-box">
          <button className="chat-round" aria-label="Add an image" onClick={() => file.current?.click()}><Plus size={18} /></button>
          <textarea ref={ta} rows={1} value={text} placeholder="Message" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <button className="chat-round go" aria-label="Send" onClick={() => void send()} disabled={busy || (!text.trim() && !image)}><ArrowUp size={18} /></button>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setImage(await shrink(f)); } catch { toast('That image could not be read'); } }} />
      </div>
    </div>
  );
}
