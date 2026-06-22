/* Playbook do Pinguim Squad — pagina embarcada no MC via iframe
   Apontar pro HTML standalone /playbook-pinguim-squad.html (mesmo dominio,
   sem cross-origin). Iframe ocupa altura cheia da main.
*/

export async function renderPlaybook() {
  const page = document.getElementById('page-playbook');
  if (!page) return;

  // Se ja tem iframe renderizado, so reusa
  if (page.querySelector('iframe[data-playbook]')) return;

  page.innerHTML = '';
  page.style.padding = '0';
  page.style.height = 'calc(100vh - 48px)'; // desconta statusbar

  const iframe = document.createElement('iframe');
  iframe.src = 'playbook-pinguim-squad.html';
  iframe.setAttribute('data-playbook', '1');
  iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#FAFAF7';
  iframe.setAttribute('title', 'Playbook do Pinguim Squad');

  page.appendChild(iframe);
}
