import { supabase } from './supabase-client.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PHOTO_VIEWS=['FRONT','BACK','LEFT','RIGHT'];
const DOC_CATEGORIES=['BOL','PACKING_LIST','POD','RELEASE','TSA','BOND','CUSTOMS','INVOICE','OTHER'];

async function orgId(){const {data,error}=await supabase.rpc('bootstrap_workspace',{p_name:'NODARA Workspace'});if(error)throw error;return data}
async function listAttachments(wrId){const {data,error}=await supabase.from('warehouse_receipt_attachments').select('*').eq('warehouse_receipt_id',wrId).order('sort_order').order('created_at');if(error)throw error;return data||[]}
async function uploadFile({wrId,cargoId=null,kind,category,viewLabel=null,file}){
  const org=await orgId();
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`${org}/${wrId}/${cargoId||'wr'}/${kind}/${crypto.randomUUID()}_${safe}`;
  const {error:upErr}=await supabase.storage.from('nodara-documents').upload(path,file,{contentType:file.type||undefined,upsert:false});if(upErr)throw upErr;
  const groupName=cargoId?'Receiving Photos':(kind==='photo'?'WR Photos':'Documents');
  const {data,error}=await supabase.from('warehouse_receipt_attachments').insert({organization_id:org,warehouse_receipt_id:wrId,cargo_unit_id:cargoId,group_name:groupName,kind,category,view_label:viewLabel,file_name:file.name,storage_path:path,mime_type:file.type||null,file_size:file.size||null,uploaded_by:(await supabase.auth.getUser()).data.user?.id||null}).select().single();if(error){await supabase.storage.from('nodara-documents').remove([path]);throw error}return data;
}
async function signed(path){const {data,error}=await supabase.storage.from('nodara-documents').createSignedUrl(path,3600);if(error)throw error;return data.signedUrl}
async function removeAttachment(a){const {error:s}=await supabase.storage.from('nodara-documents').remove([a.storage_path]);if(s)throw s;const{error}=await supabase.from('warehouse_receipt_attachments').delete().eq('id',a.id);if(error)throw error}

export async function openWRDocuments({wr,allCargo,onBack}){
  const main=document.getElementById('main');
  let attachments=await listAttachments(wr.id);
  const top=(allCargo||[]).filter(x=>!x.parent_id);
  async function render(){
    const docs=attachments.filter(a=>!a.cargo_unit_id&&a.kind==='document');
    const wrPhotos=attachments.filter(a=>!a.cargo_unit_id&&a.kind==='photo');
    main.innerHTML=`<div class="record-commandbar"><button class="secondary compact-btn" id="doc-back">‹ Receipt</button></div><div class="eyebrow">Warehouse Receipt · Documents</div><h1 class="title">${esc(wr.receipt_number)}</h1><div class="record-tabs"><button>Overview</button><button>Cargo</button><button class="active">Documents</button><button>Activity</button><button>Charges</button></div>
    <section class="record-section"><div class="section-heading"><div><span class="section-kicker">WR</span><h3>Documents</h3></div><button class="primary compact-btn" id="add-wr-doc">＋ Add document</button></div><div class="doc-toolbar"><select id="wr-doc-category">${DOC_CATEGORIES.map(x=>`<option>${x}</option>`).join('')}</select><input id="wr-doc-file" type="file" hidden></div><div class="document-list">${docs.length?docs.map(docRow).join(''):'<div class="empty compact">No WR-level documents yet.</div>'}</div></section>
    <section class="record-section"><div class="section-heading"><div><span class="section-kicker">PHOTOS</span><h3>Receiving Evidence</h3></div><span class="section-state">${top.length} top-level piece${top.length===1?'':'s'}</span></div><p class="muted">Photos stay tied to the exact physical piece. Standard receiving set: Front · Back · Left · Right.</p>${top.length?top.map((c,i)=>piecePhotos(c,i)).join(''):'<div class="empty compact">No top-level cargo on this WR.</div>'}</section>
    <section class="record-section"><div class="section-heading"><h3>General WR Photos</h3><button class="secondary compact-btn" id="add-wr-photo">＋ Add photo</button></div><input id="wr-photo-file" type="file" accept="image/*" capture="environment" hidden><div class="photo-grid">${wrPhotos.length?wrPhotos.map(photoTile).join(''):'<div class="empty compact">No general photos.</div>'}</div></section>`;
    document.getElementById('doc-back').onclick=onBack;
    document.getElementById('add-wr-doc').onclick=()=>document.getElementById('wr-doc-file').click();
    document.getElementById('wr-doc-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;await busyUpload(()=>uploadFile({wrId:wr.id,kind:'document',category:document.getElementById('wr-doc-category').value,file}));};
    document.getElementById('add-wr-photo').onclick=()=>document.getElementById('wr-photo-file').click();
    document.getElementById('wr-photo-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;await busyUpload(()=>uploadFile({wrId:wr.id,kind:'photo',category:'GENERAL',file}));};
    document.querySelectorAll('[data-photo-slot]').forEach(b=>b.onclick=()=>{const input=document.getElementById(`photo-input-${b.dataset.cargo}-${b.dataset.photoSlot}`);input.click()});
    document.querySelectorAll('[data-photo-input]').forEach(input=>input.onchange=async e=>{const file=e.target.files?.[0];if(!file)return;await busyUpload(()=>uploadFile({wrId:wr.id,cargoId:input.dataset.cargo,kind:'photo',category:'RECEIVING',viewLabel:input.dataset.view,file}));});
    document.querySelectorAll('[data-open-att]').forEach(b=>b.onclick=async()=>window.open(await signed(attachments.find(a=>a.id===b.dataset.openAtt).storage_path),'_blank'));
    document.querySelectorAll('[data-delete-att]').forEach(b=>b.onclick=async()=>{const a=attachments.find(x=>x.id===b.dataset.deleteAtt);if(a&&confirm(`Delete ${a.file_name}?`)){await removeAttachment(a);attachments=await listAttachments(wr.id);render()}});
  }
  async function busyUpload(fn){try{main.classList.add('is-busy');await fn();attachments=await listAttachments(wr.id);await render()}catch(e){alert(e.message)}finally{main.classList.remove('is-busy')}}
  function piecePhotos(c,i){const set=attachments.filter(a=>a.cargo_unit_id===c.id&&a.kind==='photo');const label=c.uin||c.handling_unit_code||`${c.package_type||'PIECE'} ${i+1}`;return `<div class="piece-photo-group"><div class="piece-photo-head"><div><b>${esc(label)}</b><small>${esc(c.package_type||'Cargo')} · ${Number(c.quantity||1)} ${esc(c.uom||'')}</small></div><span class="photo-complete ${PHOTO_VIEWS.every(v=>set.some(a=>a.view_label===v))?'complete':''}">${set.filter(a=>PHOTO_VIEWS.includes(a.view_label)).length}/4 sides</span></div><div class="photo-slot-grid">${PHOTO_VIEWS.map(v=>{const a=set.find(x=>x.view_label===v);return a?`<button class="photo-slot filled" data-open-att="${a.id}"><span>${v}</span><b>✓ Photo</b></button><button class="photo-delete-mini" data-delete-att="${a.id}" aria-label="Delete">×</button>`:`<button class="photo-slot" data-photo-slot="${v}" data-cargo="${c.id}"><span>${v}</span><b>＋ Capture</b></button>`}).join('')}</div>${PHOTO_VIEWS.map(v=>`<input id="photo-input-${c.id}-${v}" data-photo-input data-cargo="${c.id}" data-view="${v}" type="file" accept="image/*" capture="environment" hidden>`).join('')}<div class="extra-photo-row">${set.filter(a=>!PHOTO_VIEWS.includes(a.view_label)).map(photoTile).join('')}</div></div>`}
  function docRow(a){return `<div class="document-row"><button data-open-att="${a.id}"><span class="doc-kind">${esc(a.category||'DOCUMENT')}</span><b>${esc(a.file_name)}</b><small>${a.file_size?Math.round(a.file_size/1024)+' KB':''}</small></button><button class="subtle" data-delete-att="${a.id}">×</button></div>`}
  function photoTile(a){return `<div class="photo-mini"><button data-open-att="${a.id}"><span>${esc(a.view_label||a.category||'PHOTO')}</span><b>${esc(a.file_name)}</b></button><button class="subtle" data-delete-att="${a.id}">×</button></div>`}
  await render();
}
