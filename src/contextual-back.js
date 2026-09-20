// Canonical contextual back control for NODARA screens.
// Screens provide a destination handler when they know it; otherwise the shell falls back safely.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let handler=null;
export function contextualBackHTML(label='Back',kicker='',title=''){
 return `<div class="nodara-context-nav"><button class="nodara-context-back" type="button" data-nodara-context-back>‹ <span>${esc(label)}</span></button><div class="nodara-context-title">${kicker?`<small>${esc(kicker)}</small>`:''}${title?`<b>${esc(title)}</b>`:''}</div><div class="nodara-context-actions"></div></div>`
}
export function bindContextualBack(fn=null){handler=fn;document.querySelector('[data-nodara-context-back]')?.addEventListener('click',()=>{if(handler)return handler();if(history.length>1)return history.back();window.nodaraGo?.('home')})}
export function installContextualBack(){
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-nodara-context-back]');if(!b)return;e.preventDefault()},true)
}
installContextualBack();
window.NodaraContextBack={html:contextualBackHTML,bind:bindContextualBack};
