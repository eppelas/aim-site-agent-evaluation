#!/usr/bin/env node
/**
 * Тянет базовую воронку AIM Website из Yandex Metrika Stat API и пишет JSON.
 *
 * Зачем отдельным скриптом в GitHub Actions: из локальной сети владельца
 * (VPN) api-metrika.yandex.net часто недоступна (timeout), а раннеры GitHub
 * ходят к API без проблем. Результат коммитится в ветку `metrika-data`,
 * локальный понедельничный дайджест читает его через `git show`.
 *
 * Env: YM_TOKEN (OAuth token), YM_COUNTER (default 106857835).
 * Локальный запуск: YM_TOKEN="$(security find-generic-password -w -s aim-yandex-metrika-ym-token)" node scripts/metrika-pull.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.YM_TOKEN;
const COUNTER = process.env.YM_COUNTER || '106857835';
if (!TOKEN) {
  console.error('YM_TOKEN is required');
  process.exit(1);
}

const BASE = 'https://api-metrika.yandex.net/stat/v1/data';
const headers = { Authorization: `OAuth ${TOKEN}` };

async function stat(params) {
  const url = `${BASE}?${new URLSearchParams({ ids: COUNTER, accuracy: 'full', ...params })}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Metrika ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const queries = {
  // Визиты/пользователи по дням за 14 дней — тренд.
  daily: {
    metrics: 'ym:s:visits,ym:s:users,ym:s:pageviews',
    dimensions: 'ym:s:date',
    date1: '14daysAgo',
    date2: 'yesterday',
    sort: 'ym:s:date',
  },
  // Источники за 7 дней — откуда приходят.
  sources: {
    metrics: 'ym:s:visits,ym:s:users',
    dimensions: 'ym:s:lastTrafficSource,ym:s:lastSourceEngine',
    date1: '7daysAgo',
    date2: 'yesterday',
    sort: '-ym:s:visits',
    limit: '15',
  },
  // UTM за 7 дней — какие кампании реально приводят.
  utm: {
    metrics: 'ym:s:visits',
    dimensions: 'ym:s:lastUTMSource,ym:s:lastUTMMedium,ym:s:lastUTMCampaign',
    date1: '7daysAgo',
    date2: 'yesterday',
    sort: '-ym:s:visits',
    limit: '15',
  },
  // Цели: список целей счётчика подтягиваем отдельным вызовом ниже.
};

const out = {
  counter: COUNTER,
  generatedAt: new Date().toISOString(),
  range: { daily: '14daysAgo..yesterday', sources: '7daysAgo..yesterday' },
  data: {},
};

for (const [name, params] of Object.entries(queries)) {
  try {
    const r = await stat(params);
    out.data[name] = {
      query: r.query?.dimensions ?? null,
      totals: r.totals ?? null,
      rows: (r.data ?? []).map((row) => ({
        dims: row.dimensions.map((d) => d.name),
        metrics: row.metrics,
      })),
    };
    console.error(`ok: ${name} (${out.data[name].rows.length} rows)`);
  } catch (e) {
    out.data[name] = { error: String(e.message || e) };
    console.error(`fail: ${name}: ${e.message}`);
  }
}

// Достижения целей за 7 дней (все цели счётчика одним запросом).
try {
  const goalsRes = await fetch(`https://api-metrika.yandex.net/management/v1/counter/${COUNTER}/goals`, { headers });
  if (goalsRes.ok) {
    const goals = (await goalsRes.json()).goals ?? [];
    out.data.goals = [];
    for (const g of goals) {
      try {
        const r = await stat({
          metrics: `ym:s:goal${g.id}reaches`,
          date1: '7daysAgo',
          date2: 'yesterday',
        });
        out.data.goals.push({ id: g.id, name: g.name, reaches7d: r.totals?.[0] ?? 0 });
      } catch (e) {
        out.data.goals.push({ id: g.id, name: g.name, error: String(e.message || e) });
      }
    }
    console.error(`ok: goals (${out.data.goals.length})`);
  }
} catch (e) {
  out.data.goals = { error: String(e.message || e) };
}

const dir = path.join(process.cwd(), 'reports', 'metrika');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(dir, `metrika-${stamp}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: true, file: `reports/metrika/latest.json`, blocks: Object.keys(out.data) }));
