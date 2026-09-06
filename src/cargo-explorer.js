import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

export function createCargoExplorer({ main, shell, esc, packageTypes }) {
  const terminal=new Set(['RELEASED','SHIPPED','DELETED','CANCELLED','VOID']);
  const pkg=[...packageTypes,'BOX','PIECE'].filter((x,i,a)=>a.indexOf(x)===i);
  const meta=c=>c.metadata||{};
  const label=c=>meta(c).part_number||meta(c).sku||c.cargo_code||c.description||c.package_type||'Cargo';
  const dims=c=>c.length&&c.width&&c.height?`${Number(c.length)}×${Number(c.width)}×${Number(c.height)} ${c.dimension_unit||''}`:'';

  async function list(search=''){
    shell('Warehouse','Handling Units',`<p class="muted">Canonical cargo objects across WRs and operational transactions.</p><div class="card"><div class="field"><label>Search cargo objects</label><input id="cargo-search" value="${esc(search)}" placeholder="WR, UIN, part #, SKU, barcode, description…"></div></div><div id="cargo-list"><p class="muted">Loading…</p></div>`);
    const i=document.getElementById('cargo-search');i.oninput=()=>{clearTimeout(i._t);i._t=setTimeout(()=>load(i.value),180)};await load(search);
  }

  async function load(search=''){
    const out=document.getElementById('cargo-list');if(!out)return;
    try{
      const org=await getCurrentOrganizationId();
      const{data,error}=await supabase.from('cargo_objects').select('*').eq('organization_id',org).order('created_at',{ascending:false}).limit(500);if(error)throw error;
      const q=String(search||'').trim().toLowerCase();
      const rows=(data||[]).filter(c=>{const m=meta(c);return !q||[c.cargo_code,c.description,c.package_type,c.status,c.source_type,m.part_number,m.sku,m.barcode,m.serial_number,m.lot_number].filter(Boolean).some(v=>String(v).toLowerCase().includes(q))});
      out.innerHTML=rows.length?rows.map(renderRow).join(''):'<div class="empty"><b>No cargo objects found.</b></div>';
      out.querySelectorAll('[data-cargo-id]').forEach(b=>b.onclick=()=>open(b.dataset.cargoId));
    }catch(e){out.innerHTML=`<p class="warning">${esc(e.message)}</p>`}
  }

  function renderRow(c){const m=meta(c),sub=[c.source_type==='WAREHOUSE_RECEIPT'?'WR cargo':c.source_type==='TRANSACTION'?'Transaction only':c.source_type,m.part_number,m.sku,c.description].filter(Boolean).join(' · ');return `<button class="inventory-card" data-cargo-id="${c.id}" style="width:100%;text-align:left;margin-top:10px"><div><span class="eyebrow">${esc(c.package_type||'CARGO')}</span><b>${esc(label(c))}</b><span>${esc(sub)}</span></div><div class="inventory-numbers"><strong>${Number(c.quantity||0)} ${esc(c.package_type||'')}</strong><span>${esc(c.status||'')}</span></div></button>`}

  async function open(id){
    shell('Warehouse · Handling Units','Opening…','<p class="muted">Loading cargo object…</p>');
    try{
      const[{data:c,error},{data:children},{data:assignments},{data:events}]=await Promise.all([
        supabase.from('cargo_objects').select('*').eq('id',id).single(),
        supabase.from('cargo_objects').select('*').eq('parent_cargo_id',id).order('created_at'),
        supabase.from('cargo_assignments').select('id,transaction_type,transaction_id,status,assignment_role,created_at').eq('cargo_object_id',id).neq('status','REMOVED').order('created_at',{ascending:false}),
        supabase.from('cargo_events').select('id,event_type,transaction_type,transaction_id,event_at,notes').eq('cargo_object_id',id).order('event_at',{ascending:false}).limit(20)
      ]);if(error)throw error;
      const m=meta(c),local=c.source_type==='TRANSACTION'&&m.transaction_local===true;
      shell('Warehouse · Handling Units',esc(label(c)),`<div class="card"><div class="eyebrow">CARGO OBJECT</div><h2 style="margin:8px 0 4px">${esc(c.package_type||'Cargo')} · ${Number(c.quantity||0)}</h2><p class="muted">${esc(c.description||m.part_number||m.sku||'No description')}</p><div class="chips"><span class="chip">${esc(c.status||'')}</span><span class="chip">${esc(c.source_type||'')}</span>${c.gross_weight!=null?`<span class="chip">${Number(c.gross_weight)} ${esc(c.weight_unit||'')}</span>`:''}${dims(c)?`<span class="chip">${esc(dims(c))}</span>`:''}</div></div>
      <div class="grid2"><button class="actioncard" id="cargo-edit"><b>Edit cargo object</b><span>${local?'Edit this transaction-only cargo':'Edit descriptive cargo details'}</span></button>${c.source_type==='WAREHOUSE_RECEIPT'?'<button class="actioncard" id="cargo-source"><b>Open source WR</b><span>Inventory-safe edits belong on the receipt</span></button>':''}</div>
      <div class="card"><div class="eyebrow">Identification</div><div class="detail-grid"><div><small>Part #</small><b>${esc(m.part_number||'—')}</b></div><div><small>SKU</small><b>${esc(m.sku||'—')}</b></div><div><small>Barcode</small><b>${esc(m.barcode||'—')}</b></div><div><small>Cargo code</small><b>${esc(c.cargo_code||'—')}</b></div></div></div>
      <div class="eyebrow" style="margin-top:24px">Contained cargo · ${(children||[]).length}</div><div id="cargo-children">${children?.length?children.map(renderRow).join(''):'<div class="empty compact"><b>No contained cargo.</b></div>'}</div>
      <div class="card"><div class="eyebrow">Assignments · ${(assignments||[]).length}</div>${assignments?.length?assignments.map(a=>`<div class="object-line"><b>${esc(a.transaction_type)}</b><span>${esc(a.assignment_role||'CARGO')}</span><small>${esc(a.status||'')}</small></div>`).join(''):'<p class="muted">No active assignments.</p>'}</div>
      <div class="card"><div class="eyebrow">Lineage / events</div>${events?.length?events.map(e=>`<div class="object-line"><b>${esc(e.event_type)}</b><span>${esc(e.transaction_type||'')}</span><small>${e.event_at?new Date(e.event_at).toLocaleString():''}</small></div>`).join(''):'<p class="muted">No events yet.</p>'}</div>
      ${local?'<button class="danger-btn wide" id="cargo-delete">Delete transaction-only cargo</button>':''}<button class="secondary wide" id="cargo-back">Back to Handling Units</button>`);
      document.getElementById('cargo-edit').onclick=()=>edit(c);
      document.getElementById('cargo-source')?.addEventListener('click',()=>{if(window.nodaraWROpen)return window.nodaraWROpen(c.source_id);alert('Open the source Warehouse Receipt from Warehouse Receipts to edit inventory-sensitive fields.')});
      document.getElementById('cargo-delete')?.addEventListener('click',()=>removeLocal(c));
      document.getElementById('cargo-back').onclick=()=>list();
      document.querySelectorAll('#cargo-children [data-cargo-id]').forEach(b=>b.onclick=()=>open(b.dataset.cargoId));
    }catch(e){shell('Warehouse · Handling Units','Could not open cargo object',`<p class="warning">${esc(e.message)}</p>`)}
  }

  async function edit(c){const m=meta(c),local=c.source_type==='TRANSACTION'&&m.transaction_local===true;shell('Handling Units · Edit',esc(label(c)),`<div class="card"><div class="eyebrow">${local?'TRANSACTION-ONLY CARGO':'CANONICAL CARGO'}</div><p class="muted">Part #, SKU and Barcode appear once. ${c.source_type==='WAREHOUSE_RECEIPT'?'Quantity/status/location changes must be made from the source WR so inventory stays reconciled.':''}</p></div>
    <div class="card"><div class="detail-grid"><div class="field"><label>Package type</label><select id="ce-type" ${local?'':'disabled'}>${pkg.map(x=>`<option ${x===c.package_type?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Quantity</label><input id="ce-qty" type="number" min="1" value="${esc(c.quantity??1)}" ${local?'':'disabled'}></div><div class="field span2"><label>Description</label><input id="ce-desc" value="${esc(c.description||'')}"></div><div class="field"><label>Part number</label><input id="ce-part" value="${esc(m.part_number||'')}"></div><div class="field"><label>SKU</label><input id="ce-sku" value="${esc(m.sku||'')}"></div><div class="field"><label>Barcode</label><input id="ce-barcode" value="${esc(m.barcode||'')}"></div><div class="field"><label>Gross weight</label><input id="ce-weight" type="number" step="any" value="${esc(c.gross_weight??'')}"></div><div class="field"><label>Weight unit</label><select id="ce-weight-unit"><option ${c.weight_unit==='LB'?'selected':''}>LB</option><option ${c.weight_unit==='KG'?'selected':''}>KG</option></select></div><div class="field"><label>L</label><input id="ce-l" type="number" step="any" value="${esc(c.length??'')}"></div><div class="field"><label>W</label><input id="ce-w" type="number" step="any" value="${esc(c.width??'')}"></div><div class="field"><label>H</label><input id="ce-h" type="number" step="any" value="${esc(c.height??'')}"></div></div></div><div id="ce-msg"></div><button class="primary wide" id="ce-save">Save changes</button><button class="secondary wide" id="ce-cancel">Cancel</button>`);
    document.getElementById('ce-cancel').onclick=()=>open(c.id);document.getElementById('ce-save').onclick=async()=>{const n=id=>document.getElementById(id)?.value??'',num=id=>n(id)===''?null:Number(n(id));const payload={description:n('ce-desc').trim()||null,gross_weight:num('ce-weight'),weight_unit:n('ce-weight-unit'),length:num('ce-l'),width:num('ce-w'),height:num('ce-h'),metadata:{...m,part_number:n('ce-part').trim()||null,sku:n('ce-sku').trim()||null,barcode:n('ce-barcode').trim()||null},updated_at:new Date().toISOString()};if(local){payload.package_type=n('ce-type');payload.quantity=Math.max(1,num('ce-qty')||1)}const{error}=await supabase.from('cargo_objects').update(payload).eq('id',c.id);if(error)return msg('ce-msg',error);await open(c.id)};
  }

  async function removeLocal(c){if(!confirm('Delete this transaction-only cargo and everything contained inside it?'))return;const del=async id=>{const{data:kids}=await supabase.from('cargo_objects').select('id').eq('parent_cargo_id',id);for(const k of kids||[])await del(k.id);await supabase.from('cargo_assignments').delete().eq('cargo_object_id',id);await supabase.from('cargo_events').delete().eq('cargo_object_id',id);const{error}=await supabase.from('cargo_objects').delete().eq('id',id);if(error)throw error};try{await del(c.id);await list()}catch(e){alert(e.message)}}
  function msg(id,e){const el=document.getElementById(id);if(el)el.innerHTML=`<p class="warning">${esc(e.message||e)}</p>`}
  return {list,open};
}
