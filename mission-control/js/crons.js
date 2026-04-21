/* Tela Crons — lista jobs agendados + canais integrados */

import { fetchCrons } from './sb-client.js?v=20260421n';

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); });
  return n;
};

export async function renderCrons() {
  const page = document.getElementById('page-crons');
  page.innerHTML = '';

  const crons = await fetchCrons();
  const ativos = crons.filter(c => c.ativo);
  const pausados = crons.filter(c => !c.ativo);

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Crons'),
        el('div', { class: 'page-subtitle' }, 'Jobs agendados no Supabase (pg_cron) — alimentação automática dos Cérebros.'),
      ]),
    ]),
    el('div', { class: 'crons-grid' }, [
      cronSummary(crons.length, 'Total de jobs'),
      cronSummary(ativos.length, 'Ativos'),
      cronSummary(pausados.length, 'Planejados (V1)'),
      cronSummary(0, 'Com erro'),
    ]),
    el('div', { class: 'crons-lista' }, crons.map(cronRow)),
  );
}

function cronSummary(val, lbl) {
  return el('div', { class: 'cron-summary-card' }, [
    el('div', { class: 'cron-summary-lbl' }, lbl),
    el('div', { class: 'cron-summary-val' }, String(val)),
  ]);
}

function cronRow(c) {
  const statusClass = c.ativo ? 'ativo' : 'pausado';
  return el('div', { class: `cron-row ${statusClass}` }, [
    el('span', { class: 'cron-dot' }),
    el('div', { class: 'cron-info' }, [
      el('h4', {}, c.nome),
      el('p', {}, c.descricao || '—'),
    ]),
    el('span', { class: 'cron-sched' }, c.schedule_expression || '—'),
    el('span', { class: 'badge ' + (c.ativo ? 'badge-em_producao' : 'badge-planejado') }, c.ativo ? 'Ativo' : 'Planejado'),
    el('button', { class: 'btn btn-ghost', disabled: !c.ativo }, c.ativo ? 'Pausar' : 'Ativar'),
  ]);
}
