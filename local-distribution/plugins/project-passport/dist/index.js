import { collect } from './data.js';

const ROUTE = '/api/project-passport-16f6f54d-d6b2-4f85-81f1-515c5a10dc8b';
export const inject = ['workspaceRegistry', 'connection'];

/** Register a read-only exact route behind Connection authentication and its owner gate. */
export function apply(ctx) {
  let disposed = false;
  const active = new Set();
  ctx.effect(() => () => { disposed = true; for (const controller of active) controller.abort(); });
  ctx.effect(() => ctx.connection.fetch.register({ path: ROUTE, methods: ['GET'], requestBody: 'buffered', fetch: async request => {
    const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    // The shared authenticated carrier rejects non-owner Peers before calling this exact route.
    if (disposed) return reply({ error: 'Read cancelled.' }, 503);
    if (request.method !== 'GET') return reply({ error: 'Read-only.' }, 405);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== 'id') || params.getAll('id').length > 1) return reply({ error: 'Invalid project selection.' }, 400);
    const id = params.get('id');
    if (id !== null && (!id || id.length > 200)) return reply({ error: 'Invalid project selection.' }, 400);
    if (request.signal.aborted) return reply({ error: 'Read cancelled.' }, 400);
    if (id === null) return reply({ projects: ctx.workspaceRegistry.list().map(project => ({ id: project.id, title: project.title, path: project.path })) });
    const project = ctx.workspaceRegistry.get(id);
    if (!project) return reply({ error: 'Project is not registered.' }, 404);
    if (active.size >= 2) return reply({ error: 'An update is already running. Try again later.' }, 429);
    const controller = new AbortController();
    active.add(controller);
    const stop = () => controller.abort();
    request.signal.addEventListener('abort', stop, { once: true });
    try { return reply(await collect(project, controller.signal)); }
    catch (error) { return reply({ error: controller.signal.aborted ? 'Read cancelled.' : 'Could not read the project. Check the directory is available and select Refresh.' }, 400); }
    finally { active.delete(controller); request.signal.removeEventListener('abort', stop); }
  } }));
}
