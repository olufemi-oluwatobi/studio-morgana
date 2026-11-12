// Projects: your walls in the sidebar. Pinning puts a piece (yours or a featured one) on a project's wall.
import { api, type Project } from './api';
import { createStore } from './store';
import { toast } from './session';
import { navigate } from './router';
import { loadWall, wallStore } from './wall';

interface ProjectsState { list: Project[]; loaded: boolean }
export const projectsStore = createStore<ProjectsState>({ list: [], loaded: false });

const sortList = (xs: Project[]) => [...xs].sort((a, b) => b.updated - a.updated);
const patch = (id: string, f: (p: Project) => Project | null) =>
  projectsStore.set((s) => ({ ...s, list: sortList(s.list.flatMap((p) => (p.id === id ? (f(p) ?? []) : [p]))) }));

let loading: Promise<void> | null = null;
export function loadProjects(): Promise<void> {
  loading ??= api<{ projects: Project[] }>('/projects')
    .then((r) => projectsStore.set({ list: r.projects, loaded: true }))
    .catch(() => projectsStore.set((s) => ({ ...s, loaded: true })))
    .finally(() => { loading = null; });
  return loading;
}

// a project's count and cover changed here (pin, unpin, a new piece made on its wall)
export function bumpProject(id: string, delta: number, cover?: string | null) {
  patch(id, (p) => ({ ...p, count: Math.max(0, p.count + delta), cover: cover ?? p.cover, updated: Date.now() }));
}

export async function createProject(name: string, piece?: { id: string; src: string | null }): Promise<Project | null> {
  try {
    const r = await api<{ project: Project }>('/projects', { body: { name, pieceId: piece?.id } });
    const p = { ...r.project, cover: piece ? piece.src : null };
    projectsStore.set((s) => ({ ...s, list: [p, ...s.list] }));
    return p;
  } catch (e) { toast((e as Error).message); return null; }
}

export async function renameProject(id: string, name: string) {
  const old = projectsStore.get().list.find((p) => p.id === id);
  if (!old || !name.trim() || name.trim() === old.name) return;
  patch(id, (p) => ({ ...p, name: name.trim() }));
  wallStore.set((w) => (w.project?.id === id ? { ...w, project: { ...w.project, name: name.trim() } } : w));
  try { await api(`/projects/${id}`, { method: 'PATCH', body: { name } }); }
  catch (e) { patch(id, (p) => ({ ...p, name: old.name })); toast((e as Error).message); }
}

export async function deleteProject(id: string) {
  const old = projectsStore.get().list.find((p) => p.id === id);
  if (!old) return;
  patch(id, () => null);
  const s = wallStore.get().scope;
  if (s.kind === 'project' && s.id === id) navigate('/');
  try {
    await api(`/projects/${id}`, { method: 'DELETE' });
    toast(`Deleted the project “${old.name}”`, {
      label: 'Undo',
      run: async () => { await api(`/projects/${id}/restore`, { body: {} }); projectsStore.set((st) => ({ ...st, list: sortList([...st.list, old]) })); },
    });
  } catch (e) { projectsStore.set((st) => ({ ...st, list: sortList([...st.list, old]) })); toast((e as Error).message); }
}

export async function pin(projectId: string, t: { id: string | null; title: string; src: string | null }, opts: { quiet?: boolean } = {}): Promise<boolean> {
  if (!t.id) return false;
  try {
    const r = await api<{ pinned: boolean }>(`/projects/${projectId}/pins/${t.id}`, { method: 'PUT', body: {} });
    const name = projectsStore.get().list.find((p) => p.id === projectId)?.name ?? 'the project';
    if (r.pinned) bumpProject(projectId, 1, t.src);
    const s = wallStore.get().scope;
    if (s.kind === 'project' && s.id === projectId && r.pinned) void loadWall();
    if (!opts.quiet) toast(r.pinned ? `Pinned to ${name}` : `Already in ${name}`, r.pinned ? { label: 'View', run: () => navigate('/projects/' + projectId) } : undefined);
    return true;
  } catch (e) { toast((e as Error).message); return false; }
}

export async function unpin(projectId: string, pieceId: string): Promise<boolean> {
  try {
    await api(`/projects/${projectId}/pins/${pieceId}`, { method: 'DELETE' });
    bumpProject(projectId, -1);
    const s = wallStore.get().scope;
    if (s.kind === 'project' && s.id === projectId) wallStore.set((w) => ({ ...w, pieces: w.pieces.filter((m) => m.id !== pieceId) }));
    return true;
  } catch (e) { toast((e as Error).message); return false; }
}
