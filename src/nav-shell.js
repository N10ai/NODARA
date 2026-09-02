const nav=document.getElementById('nav');
const mobile=document.getElementById('mobile');

const icons={
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2v8.3a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z"/></svg>',
  wr:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v15H5z"/><path d="M16 3v4h4M8 11h8M8 15h8M8 7h4"/></svg>',
  cargo:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>',
  inv:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  release:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h10v14H4z"/><path d="M10 12h10M17 9l3 3-3 3"/></svg>',
  entities:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.7-4 2.7-6 6-6s5.3 2 6 6M16 5h5M18.5 2.5v5"/></svg>',
  more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>'
};

const item=(key,label,action)=>`<button class="shell-nav-item" data-shell="${key}" data-shell-action="${action}"><span class="shell-icon">${icons[key]}</span><span>${label}</span></button>`;

function go(action){
  document.querySelectorAll('[data-shell]').forEach(x=>x.classList.remove('active'));
  const target=document.querySelector(`[data-shell-action="${action}"]`);if(target)target.classList.add('active');
  if(action==='home'){document.querySelector('[data-go="home"]')?.click();return}
  if(action==='wr'){window.nodaraWRList?.();return}
  if(action==='cargo'){window.nodaraCargo?.();return}
  if(action==='inventory'){document.querySelector('[data-go="inventory"]')?.click();return}
  if(action==='release'){window.nodaraRelease?.();return}
  if(action==='entities'){renderMore();return}
  if(action==='more'){renderMore();return}
}

function renderMore(){
  const main=document.getElementById('main');if(!main)return;
  main.innerHTML=`<div class="eyebrow">NODARA</div><h1 class="title">More</h1><div class="module-grid"><button class="module-tile" id="more-release"><span class="shell-icon">${icons.release}</span><b>Cargo Release</b><small>Create and manage outbound releases</small></button><button class="module-tile" id="more-entities"><span class="shell-icon">${icons.entities}</span><b>Entities</b><small>Customers, vendors, carriers and item profiles</small></button></div>`;
  document.getElementById('more-release').onclick=()=>window.nodaraRelease?.();
  document.getElementById('more-entities').onclick=()=>{const old=[...document.querySelectorAll('#nav button')].find(x=>x.textContent.trim()==='Entities');if(old)old.click();else main.innerHTML='<div class="eyebrow">Entities</div><h1 class="title">Entities</h1><div class="notice">Entity explorer is next in this same record-list style.</div>'};
}

function install(){
  if(nav){nav.innerHTML=[item('home','Command','home'),item('wr','Warehouse Receipts','wr'),item('cargo','Cargo','cargo'),item('inv','Inventory','inventory'),item('release','Cargo Releases','release'),item('entities','Entities','entities')].join('')}
  if(mobile){mobile.innerHTML=[item('home','Home','home'),item('wr','Receipts','wr'),item('cargo','Cargo','cargo'),item('inv','Inventory','inventory'),item('more','More','more')].join('')}
  document.querySelectorAll('[data-shell-action]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();go(b.dataset.shellAction)});
}

setTimeout(install,120);
new MutationObserver(()=>{if(nav&&!nav.querySelector('[data-shell-action="wr"]'))install();}).observe(document.body,{childList:true,subtree:true});
window.nodaraInstallShell=install;
