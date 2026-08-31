const workflow = 'scrape-infortuni.yml';

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function reply(env, body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...cors(env)}});
}

async function github(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'fantacalcio-injury-trigger',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });
}

export default {
  async fetch(request, env) {
    const headers = cors(env);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return reply(env, {error: 'origin_not_allowed'}, 403);
    const url = new URL(request.url);
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const active = await github(env, `actions/workflows/${workflow}/runs?branch=main&per_page=10`);
      if (!active.ok) return reply(env, {error: 'github_unavailable'}, 502);
      const runs = (await active.json()).workflow_runs || [];
      const running = runs.find(run => ['queued', 'in_progress', 'waiting', 'pending'].includes(run.status));
      if (running) {
        return reply(env, {error: 'already_running', startedAt: running.created_at}, 409);
      }
      const startedAt = new Date().toISOString();
      const dispatch = await github(env, `actions/workflows/${workflow}/dispatches`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ref: 'main'}),
      });
      if (!dispatch.ok) return reply(env, {error: 'dispatch_failed'}, 502);
      return reply(env, {startedAt}, 202);
    }
    if (url.pathname === '/status' && request.method === 'GET') {
      const startedAt = url.searchParams.get('startedAt');
      if (!startedAt || Number.isNaN(Date.parse(startedAt))) return reply(env, {error: 'invalid_request'}, 400);
      const response = await github(env, `actions/workflows/${workflow}/runs?event=workflow_dispatch&branch=main&per_page=20`);
      if (!response.ok) return reply(env, {error: 'github_unavailable'}, 502);
      const threshold = Date.parse(startedAt) - 5000;
      const run = ((await response.json()).workflow_runs || []).find(item => Date.parse(item.created_at) >= threshold);
      if (!run) return reply(env, {status: 'queued'});
      return reply(env, {status: run.status, conclusion: run.conclusion});
    }
    return reply(env, {error: 'not_found'}, 404);
  },
};
