/* Tela Skills — catálogo de skills universais + por cérebro/agente */

import { fetchSkills } from './sb-client.js?v=20260420g';

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

export async function renderSkills() {
  const page = document.getElementById('page-skills');
  page.innerHTML = '';

  const skills = await fetchSkills();

  page.append(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', { class: 'page-title' }, 'Skills'),
        el('div', { class: 'page-subtitle' }, 'Receitas em Markdown que os agentes executam. Portáveis entre LLMs — não dependem da ferramenta.'),
      ]),
      el('button', { class: 'btn btn-primary' }, '+ Nova Skill'),
    ]),
    el('div', { class: 'skills-grid' }, skills.map(renderSkillCard)),
  );
}

function renderSkillCard(s) {
  return el('div', { class: 'skill-card' }, [
    el('div', { class: 'skill-card-top' }, [
      el('h4', {}, s.nome),
      s.universal ? el('span', { class: 'skill-universal-tag' }, 'Universal') : null,
      el('span', { class: 'skill-versao' }, s.versao || 'v1.0'),
    ]),
    el('div', { class: 'skill-desc' }, s.descricao || '—'),
    el('div', { class: 'skill-cat' }, s.categoria || 'outro'),
  ]);
}
