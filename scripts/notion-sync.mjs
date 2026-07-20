#!/usr/bin/env node
/**
 * Sincronización App ↔ Notion (corre en GitHub Actions).
 *
 * 1) Sube a Notion los registros diarios que la app dejó en data/daily/*.json
 *    (upsert por fecha en la base "📅 Registro Diario").
 * 2) Baja las metas de la base "🎯 Roadmap — Metas" y las escribe en
 *    data/roadmap.json para que la app las muestre como barras de progreso.
 *
 * Requiere: NOTION_TOKEN (secret del repo) — token de una integración interna
 * de Notion con acceso a la página "🎮 Mi Sistema — App ↔ Notion (Sync)".
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  console.error('Falta NOTION_TOKEN. Configúralo en Settings → Secrets → Actions.');
  process.exit(1);
}

// IDs fijos de las bases creadas en Notion (data source y database).
const ROADMAP_DS = '2308e321-b585-4bd2-a2d9-bbf6617b6c73';
const ROADMAP_DB = 'a664ee67-254f-4fa7-8274-a6b638d4a420';
const DAILY_DS = '23b82542-c542-41ca-8ba7-57f2b9eedc35';
const DAILY_DB = '00dc8371-6383-4a8e-9b78-4ccdb1f05f0f';

const DAILY_DIR = 'data/daily';
const ROADMAP_JSON = 'data/roadmap.json';
const MAX_DAYS = 30; // solo sincroniza los últimos N días

// La API 2025-09-03 usa data sources; si el workspace aún no la soporta,
// caemos a la API clásica de databases (2022-06-28).
let useDataSources = true;

async function api(pathname, method = 'GET', body = undefined, attempt = 0) {
  const res = await fetch(`https://api.notion.com/v1${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': useDataSources ? '2025-09-03' : '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 5) {
    const wait = Number(res.headers.get('retry-after') || 2) * 1000;
    await new Promise(r => setTimeout(r, wait));
    return api(pathname, method, body, attempt + 1);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Notion ${method} ${pathname} → ${res.status}: ${data.message || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function queryCollection(dsId, dbId, body) {
  if (useDataSources) {
    try {
      return await api(`/data_sources/${dsId}/query`, 'POST', body);
    } catch (e) {
      if (e.status === 400 || e.status === 404) {
        console.warn('data_sources no disponible, usando API de databases:', e.message);
        useDataSources = false;
      } else throw e;
    }
  }
  return api(`/databases/${dbId}/query`, 'POST', body);
}

function pageParent(dsId, dbId) {
  return useDataSources
    ? { type: 'data_source_id', data_source_id: dsId }
    : { type: 'database_id', database_id: dbId };
}

// ── 1) Subir registros diarios ──────────────────────────────────────────────

function dailyProps(d) {
  const num = v => ({ number: Number.isFinite(v) ? v : 0 });
  return {
    'Día': { title: [{ text: { content: d.fecha } }] },
    'Fecha': { date: { start: d.fecha } },
    'XP día': num(d.xp_dia),
    'XP total': num(d.xp_total),
    'Nivel': num(d.nivel),
    'Hábitos completados': num(d.habitos_completados),
    'Hábitos totales': num(d.habitos_totales),
    'Mejor racha': num(d.mejor_racha),
    'Fitia ✓': { checkbox: !!d.fitia },
    'Gravl ✓': { checkbox: !!d.gravl },
    'Outreach': num(d.outreach),
    'Ingresos mes CLP': num(d.ingresos_mes_clp),
    'Notas': { rich_text: [{ text: { content: String(d.notas || '').slice(0, 1900) } }] },
  };
}

async function syncDaily() {
  let files = [];
  try {
    files = (await readdir(DAILY_DIR)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  } catch {
    console.log('Sin carpeta data/daily todavía — nada que subir.');
    return 0;
  }
  const cutoff = new Date(Date.now() - MAX_DAYS * 864e5).toISOString().slice(0, 10);
  files = files.filter(f => f.slice(0, 10) >= cutoff);

  let synced = 0;
  for (const f of files) {
    const d = JSON.parse(await readFile(path.join(DAILY_DIR, f), 'utf8'));
    if (!d.fecha) continue;
    const q = await queryCollection(DAILY_DS, DAILY_DB, {
      filter: { property: 'Fecha', date: { equals: d.fecha } },
      page_size: 1,
    });
    const props = dailyProps(d);
    if (q.results && q.results.length) {
      await api(`/pages/${q.results[0].id}`, 'PATCH', { properties: props });
    } else {
      await api('/pages', 'POST', { parent: pageParent(DAILY_DS, DAILY_DB), properties: props });
    }
    synced++;
    console.log(`✓ ${d.fecha} sincronizado`);
  }
  return synced;
}

// ── 2) Bajar roadmap ────────────────────────────────────────────────────────

const text = rt => (rt || []).map(t => t.plain_text || '').join('');

async function pullRoadmap() {
  const metas = [];
  let cursor = undefined;
  do {
    const q = await queryCollection(ROADMAP_DS, ROADMAP_DB, {
      sorts: [{ property: 'Orden', direction: 'ascending' }],
      page_size: 100,
      start_cursor: cursor,
    });
    for (const p of q.results || []) {
      const pr = p.properties || {};
      metas.push({
        meta: text(pr['Meta']?.title),
        horizonte: pr['Horizonte']?.select?.name || '',
        meta_usd: pr['Meta USD']?.number ?? null,
        estado: pr['Estado']?.select?.name || 'Pendiente',
        fecha_objetivo: pr['Fecha objetivo']?.date?.start || null,
        metrica: text(pr['Métrica de éxito']?.rich_text),
        notas: text(pr['Notas']?.rich_text),
        orden: pr['Orden']?.number ?? 999,
        url: p.url || null,
      });
    }
    cursor = q.has_more ? q.next_cursor : undefined;
  } while (cursor);

  const out = { generated: new Date().toISOString(), source: 'notion', metas };
  await writeFile(ROADMAP_JSON, JSON.stringify(out, null, 2) + '\n');
  console.log(`✓ ${metas.length} metas escritas en ${ROADMAP_JSON}`);
  return metas.length;
}

const dailyCount = await syncDaily();
const metasCount = await pullRoadmap();
console.log(`Listo: ${dailyCount} días subidos, ${metasCount} metas bajadas.`);
