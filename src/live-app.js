import { getSession, signInWithPassword, signUpWithPassword, signOut, ensureWorkspace } from './auth-session.js';
import { getInventorySnapshot, findExpectedReceipts, findInventory } from './live-data.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const mobile = document.getElementById('mobile');
let session = null;

const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function shell(eye,title,body){ main.innerHTML=`<div class="eyebrow">${eye}</div><h1 class="title">${title}</h1>${body}`; }
function bindNav(){
  nav.innerHTML=`<button data-go="home">Command</button><button data-go="receive">Receive</button><button data-go="inventory">Inventory</button><button data-go="release">Release</button><button data-go="account">Account</button>`;
  mobile.innerHTML=`<button data-go="home">Command</button><button data-go="receive">Receive</button><button data-go="inventory">Inventory</button><button data-go="release">Release</button><button data-go="account">More</button>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>routes[b.dataset.go]());
}

async function login(){
  shell('NODARA','Sign in.',`<p class="muted">Warehouse data is protected.</p><div class="card"><div class="field"><label>Email</label><input id="email" type="email" autocomplete="email" placeholder="you@company.com"></div><div class="field"><label>Password</label><input id="password" type="password" autocomplete="current-password" placeholder="Password"></div><button id="signin" class="primary wide">Sign in</button><button id="signup" class="secondary wide">Create account</button><div id="auth-status" class="muted statusline"></div></div>`);
  document.getElementById('signin').onclick=async()=>{
    const status=document.getElementById('auth-status'); status.textContent='Signing in…';
    try{ session=await signInWithPassword(document.getElementById('email').value,document.getElementById('password').value); await ensureWorkspace(); await home(); }
    catch(e){ status.textContent=e.message; }
  };
  document.getElementById('signup').onclick=async()=>{
    const status=document.getElementById('auth-status'); status.textContent='Creating account…';
    try{ const result=await signUpWithPassword(document.getElementById('email').value,document.getElementById('password').value); if(result.session){session=result.session;await ensureWorkspace();await home();}else{status.textContent='Account created. Check your email if Supabase requires confirmation, then sign in.';} }
    catch(e){ status.textContent=e.message; }
  };
}

async function home(){
  shell('Command','Ready.',`<p class="muted">Live workspace connected.</p><div class="grid2"><button class="actioncard" onclick="window.nodaraReceive()"><b>Receive cargo</b><span>Scan or find an expected receipt</span></button><button class="actioncard" onclick="window.nodaraRelease()"><b>Create cargo release</b><span>Allocate from live inventory</span></button></div><div class="card"><div class="status"><span>Database</span><b class="ok">Connected</b></div><div class="status"><span>User</span><b>${esc(session?.user?.email)}</b></div></div>`);
}

async function inventory(){
  shell('Inventory','Inventory.',`<p class="muted">Loading live inventory…</p>`);
  try{
    const rows=await getInventorySnapshot();
    if(!rows.length){ shell('Inventory','Inventory.',`<div class="empty"><b>No inventory yet.</b><p class="muted">Complete your first warehouse receipt and putaway to populate inventory.</p><button class="primary" onclick="window.nodaraReceive()">Receive cargo</button></div>`); return; }
    shell('Inventory','Inventory.',`<div class="search"><input id="inv-search" placeholder="Part, SKU, UIN, lot, serial…"></div><div id="inv-list">${renderInventory(rows)}</div>`);
    document.getElementById('inv-search').oninput=async e=>document.getElementById('inv-list').innerHTML=renderInventory(await findInventory(e.target.value));
  }catch(e){ errorScreen('Inventory could not load',e); }
}
function renderInventory(rows){ return rows.map(r=>`<button class="inventory-card" onclick="window.nodaraRelease('${esc(r.item_key || r.part_number || r.sku || '')}')"><div><b>${esc(r.part_number || r.sku || r.item_key || 'Cargo')}</b><span>${esc(r.description || '')}</span></div><div class="inventory-numbers"><strong>${Number(r.total_units||0)} EA</strong><span>${Number(r.carton_count||0)} boxes · ${Number(r.pallet_count||0)} pallets</span><small>${esc((r.locations||[]).join?.(' · ') || r.locations || '')}</small></div></button>`).join(''); }

async function receive(){
  shell('Warehouse · Receive','What arrived?',`<p class="muted">Scan or enter any reference. NODARA searches live expected receipts.</p><div class="card"><div class="field"><label>PO, BOL, PRO, tracking, ASN or reference</label><input id="wr-search" autofocus></div><button id="wr-find" class="primary wide">Find expected cargo</button><button id="wr-new" class="secondary wide">No reference · New receipt</button><div id="wr-results"></div></div>`);
  document.getElementById('wr-find').onclick=searchExpected;
  document.getElementById('wr-search').onkeydown=e=>{if(e.key==='Enter')searchExpected()};
  document.getElementById('wr-new').onclick=()=>newReceipt();
}
async function searchExpected(){
  const q=document.getElementById('wr-search').value.trim(), out=document.getElementById('wr-results');
  if(!q){out.innerHTML='<p class="warning">Enter or scan a reference.</p>';return} out.innerHTML='<p class="muted">Searching…</p>';
  try{const rows=await findExpectedReceipts(q); out.innerHTML=rows.length?rows.map(r=>`<button class="choice" onclick='window.nodaraExpected(${JSON.stringify(JSON.stringify(r))})'><b>${esc(r.description||'Expected receipt')}</b><small>${esc(r.expected_quantity||'')} ${esc(r.expected_package_type||'')} · ${esc(r.status||'expected')}</small></button>`).join(''):`<div class="empty compact"><b>No expected receipt found.</b><p class="muted">Start a new receipt without inventing shipment data.</p><button class="secondary" onclick="window.nodaraNewReceipt('${esc(q)}')">Create new receipt</button></div>`;}catch(e){out.innerHTML=`<p class="warning">${esc(e.message)}</p>`}
}
function expected(row){
  shell('Warehouse · Receive','Expected cargo found.',`<div class="card"><div class="record"><b>${esc(row.description||'Expected receipt')}</b><div class="status"><span>Expected</span><strong>${esc(row.expected_quantity||'—')} ${esc(row.expected_package_type||'')}</strong></div><div class="status"><span>Service</span><strong>${esc(row.service_code||'Warehouse')}</strong></div></div><p class="muted">This is live Supabase data. The next step verifies physical quantity and applies the customer/service SOP.</p><button class="primary wide">Start physical receiving</button><button class="secondary wide" onclick="window.nodaraReceive()">Back</button></div>`);
}
function newReceipt(reference=''){
  shell('Warehouse · Receive','New warehouse receipt.',`<p class="muted">Only enter what NODARA could not identify automatically.</p><div class="card"><div class="field"><label>Reference</label><input value="${esc(reference)}" placeholder="PO, BOL, customer ref…"></div><div class="field"><label>Customer</label><input placeholder="Search customer"></div><div class="field"><label>Description / commodity</label><input placeholder="What is it?"></div><button class="primary wide">Continue to physical receiving</button><button class="secondary wide" onclick="window.nodaraReceive()">Cancel</button></div>`);
}

async function release(prefill=''){
  shell('Warehouse · Cargo Release','What should leave?',`<p class="muted">Search actual available inventory.</p><div class="card"><div class="field"><label>Part, SKU, UIN, lot or serial</label><input id="cr-search" value="${esc(prefill)}" autofocus></div><button id="cr-find" class="primary wide">Find inventory</button><div id="cr-results"></div></div>`);
  document.getElementById('cr-find').onclick=async()=>{const q=document.getElementById('cr-search').value.trim(),out=document.getElementById('cr-results');out.innerHTML='<p class="muted">Searching…</p>';try{const rows=await findInventory(q);out.innerHTML=rows.length?rows.map(r=>`<button class="choice"><b>${esc(r.part_number||r.sku||r.item_key)}</b><small>${Number(r.total_units||0)} EA · ${Number(r.carton_count||0)} boxes · ${Number(r.pallet_count||0)} pallets</small></button>`).join(''):'<div class="empty compact"><b>No available inventory found.</b></div>';}catch(e){out.innerHTML=`<p class="warning">${esc(e.message)}</p>`}};
}
async function account(){ shell('Account','Account.',`<div class="card"><div class="status"><span>Signed in</span><b>${esc(session?.user?.email)}</b></div><button id="signout" class="secondary wide">Sign out</button></div>`);document.getElementById('signout').onclick=async()=>{await signOut();location.reload()}; }
function errorScreen(title,e){shell('NODARA',title,`<div class="empty"><p class="warning">${esc(e?.message||e)}</p><button class="secondary" onclick="location.reload()">Reload</button></div>`)}
const routes={home,receive,inventory,release,account};
window.nodaraReceive=receive; window.nodaraRelease=release; window.nodaraNewReceipt=newReceipt; window.nodaraExpected=s=>expected(JSON.parse(s));

async function boot(){ bindNav(); try{session=await getSession(); if(!session){await login();return;} await ensureWorkspace(); await home();}catch(e){errorScreen('Could not start NODARA',e);} }
boot();
