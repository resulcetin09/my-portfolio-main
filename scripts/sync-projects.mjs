// Merge the curated list (data/projects.config.json) with live GitHub repo
// data and write data/projects.json, which the site reads. Run it whenever a
// repo changes or you add a project:  node scripts/sync-projects.mjs
//
// The site never calls the GitHub API itself, so visitors don't hit the
// unauthenticated rate limit. Set GITHUB_TOKEN to raise the limit here.
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const config = JSON.parse(await readFile(new URL('data/projects.config.json', root), 'utf8'));
const headers = { Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const res = await fetch(`https://api.github.com/users/${config.user}/repos?per_page=100`, { headers });
if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
const repos = new Map((await res.json()).map((r) => [r.name.toLowerCase(), r]));

const projects = config.projects.map((p) => {
  const r = repos.get(p.repo.toLowerCase());
  if (!r) console.warn(`! ${p.repo} not found on GitHub — using config only`);
  return {
    repo: p.repo,
    title: p.title ?? p.repo,
    tagline: p.tagline,
    description: r?.description ?? '',
    url: p.url ?? r?.homepage ?? null,
    github: r?.html_url ?? `https://github.com/${config.user}/${p.repo}`,
    language: r?.language ?? null,
    year: (r?.created_at ?? r?.pushed_at ?? '').slice(0, 4) || null,
    updated: r?.pushed_at ?? null,
    stars: r?.stargazers_count ?? 0,
    tags: p.tags ?? [],
    shot: p.shot ?? null,
    featured: Boolean(p.featured),
    cinema: Boolean(p.cinema),
  };
});

await writeFile(new URL('data/projects.json', root), JSON.stringify({ user: config.user, generated: new Date().toISOString(), projects }, null, 2) + '\n');
console.log(`wrote data/projects.json — ${projects.length} projects (${projects.filter((p) => p.cinema).length} scroll-cinema)`);
