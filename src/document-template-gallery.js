const main=document.getElementById('main'),KEY='nodara_template_registry_v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const uid=()=>crypto.randomUUID?.()||'tpl-'+Date.now();
export function templates(){try{return JSON.parse(localStorage.getItem(KEY))||[]}catch{return[]}}
export function saveTemplates(a){localStorage.setItem(KEY,JSON.stringify(a))}
export function getTemplate(id){return templates().find(x=>x.id===id)}
export function applicableTemplates(ctx={}){return templates().filter(t=>t.status==='published'&&(t.placements||[]).some(p=>(!ctx.module||p.module===ctx.module)&&(!ctx.mode||!p.mode||p.mode===ctx.mode)&&(!ctx.recordType||!p.recordType||p.recordType===ctx.recordType)&&(!ctx.surface||p.surface===ctx.surface)))}
export function upsertTemplate(t){const a=templates(),i=a.findIndex(x=>x.id===t.id);if(i<0)a.unshift(t);else a[i]=t;saveTemplates(a);return t}

// Built-in editable starters. Seeded once into the local registry; users can freely duplicate/edit them.
const starterId='starter-awb-professional-v2';
const oid=(p,i)=>starterId+'-'+p+'-'+i;
function awbStarter(){
 const O=[];let n=0;
 const text=(x,y,w,h,value,size=6,weight='400',align='left')=>O.push({id:oid('t',n++),type:'text',x,y,w,h,text:value,fontSize:size,fontFamily:'Arial',fontWeight:weight,fontStyle:'normal',textColor:'#111111',fillColor:'transparent',borderColor:'#111111',align,border:0});
 const variable=(x,y,w,h,binding,size=8,weight='600',align='left')=>O.push({id:oid('v',n++),type:'variable',x,y,w,h,text:'{{'+binding+'}}',binding,fontSize:size,fontFamily:'Arial',fontWeight:weight,fontStyle:'normal',textColor:'#111111',fillColor:'transparent',borderColor:'#111111',align,border:0});
 const frame=(x,y,w,h,border=.7)=>O.push({id:oid('f',n++),type:'frame',x,y,w,h,text:'',fontSize:7,fontFamily:'Arial',fontWeight:'400',fontStyle:'normal',textColor:'#111111',fillColor:'transparent',borderColor:'#111111',align:'left',border});
 const line=(x,y,w)=>O.push({id:oid('l',n++),type:'line',x,y,w,h:.3,text:'',fontSize:7,fontFamily:'Arial',fontWeight:'400',fontStyle:'normal',textColor:'#111111',fillColor:'transparent',borderColor:'#111111',align:'left',border:.6});
 const barcode=(x,y,w,h,binding)=>O.push({id:oid('b',n++),type:'barcode',x,y,w,h,text:'',binding,sampleValue:'35552201726',barcodeType:'CODE128',showValue:true,fontSize:7,fontFamily:'Arial',fontWeight:'400',fontStyle:'normal',textColor:'#111111',fillColor:'transparent',borderColor:'#111111',align:'left',border:0});
 const box=(x,y,w,h,label,binding)=>{frame(x,y,w,h);text(x+2,y+1,w-4,4,label,5,'400');if(binding)variable(x+2,y+6,w-4,h-7,binding,8,'600')};
 const W=195,X=10;
 // Header
 text(X,8,80,7,'AIR WAYBILL',15,'700');text(X,16,95,5,'Not Negotiable',5,'600');text(X,21,95,5,'Issued by',5);variable(X,26,95,7,'company.name',8,'600');
 text(121,8,84,5,'Air Waybill Number',5,'400','right');variable(121,14,84,7,'shipment.number',11,'700','right');barcode(133,22,72,13,'booking.mawb_serial');
 // Parties
 box(X,39,97.5,30,'Shipper’s Name and Address','shipper.name');variable(X+2,51,92,14,'shipper.address',7,'400');
 box(107.5,39,97.5,30,'Shipper’s Account Number','shipment.number');
 box(X,69,97.5,30,'Consignee’s Name and Address','consignee.name');variable(X+2,81,92,14,'consignee.address',7,'400');
 box(107.5,69,97.5,30,'Consignee’s Account Number','shipment.number');
 // Agent/accounting
 box(X,99,97.5,24,'Issuing Carrier’s Agent Name and City','company.name');variable(X+2,111,92,8,'company.address',6,'400');
 frame(107.5,99,97.5,24);text(109.5,100,93,4,'Accounting Information',5);text(109.5,108,93,11,'Carrier / contract conditions text can be configured for the issuing carrier.',4.5,'400');
 // Routing top
 frame(X,123,W,29);
 text(12,124,27,4,'Airport of Departure',5);variable(12,130,28,7,'booking.origin',9,'700');
 text(42,124,22,4,'To',5);variable(42,130,22,7,'booking.destination',9,'700');
 text(66,124,30,4,'By First Carrier',5);variable(66,130,30,7,'booking.flight',8,'600');
 text(99,124,24,4,'Routing / To',5);text(125,124,24,4,'By',5);text(151,124,24,4,'To',5);text(177,124,26,4,'By',5);
 line(X,139,W);text(12,141,18,4,'Currency',5);text(32,141,18,4,'CHGS',5);text(52,141,25,4,'WT/VAL',5);text(79,141,25,4,'Other',5);text(106,141,44,4,'Declared Value for Carriage',5);text(152,141,51,4,'Declared Value for Customs',5);
 // Destination/flight
 frame(X,152,W,18);text(12,153,38,4,'Airport of Destination',5);variable(12,159,38,7,'booking.destination',9,'700');text(52,153,32,4,'Requested Flight/Date',5);variable(52,159,46,7,'booking.flight',8,'600');variable(101,159,48,7,'booking.etd',7,'400');text(152,153,51,4,'Amount of Insurance',5);
 // Handling
 frame(X,170,W,22);text(12,171,60,4,'Handling Information',5);variable(12,177,189,11,'cargo.description',7,'400');
 // Cargo grid
 frame(X,192,W,47);
 const cols=[20,24,27,25,28,71];let xx=X;cols.forEach((v,i)=>{if(i>0)frame(xx,192,.2,47,.5);xx+=v});
 const labels=['No. of Pieces','Gross Weight','kg/lb','Rate Class','Chargeable Weight','Rate / Charge / Total / Nature and Quantity of Goods'];
 xx=X;cols.forEach((v,i)=>{text(xx+1,194,v-2,8,labels[i],4.8,'600','center');xx+=v});
 variable(12,207,16,9,'cargo.total_pieces',9,'700','center');variable(32,207,20,9,'cargo.gross_weight',8,'600','center');text(57,207,10,8,'KG',7,'600','center');variable(83,207,24,9,'cargo.chargeable_weight',8,'600','center');variable(136,205,66,24,'cargo.description',6,'400');
 // Charges
 frame(X,239,97.5,24);frame(107.5,239,97.5,24);text(12,240,93,4,'Weight Charge / Valuation Charge / Tax',5,'600');text(109.5,240,93,4,'Other Charges',5,'600');
 frame(X,263,97.5,20);frame(107.5,263,97.5,20);text(12,264,93,4,'Total Other Charges Due Agent / Carrier',5,'600');text(109.5,264,93,4,'Total Prepaid / Total Collect',5,'600');
 // Footer signature
 text(12,285,92,4,'Shipper certifies that the particulars on the face hereof are correct.',4.8);line(12,296,90);text(12,297,90,4,'Signature of Shipper or Agent',5,'400','center');
 line(112,296,91);text(112,297,91,4,'Executed on / Place / Signature of Issuing Carrier or Agent',5,'400','center');
 text(12,305,80,4,'For operational use — verify carrier-required wording and fields before issue.',4.5);
 variable(126,304,77,7,'shipment.number',9,'700','right');
 // Fit the industry AWB architecture cleanly on US Letter while preserving editable geometry.
 O.forEach(o=>{
   o.y=+(o.y*.855).toFixed(2);
   o.h=+(Math.max(o.type==='line' ? .3 : o.h*.855,.3)).toFixed(2);
 });
 return {zoom:.72,testMode:false,grid:1,snap:true,mobilePanel:null,pagePreset:'LETTER',pageW:215.9,pageH:279.4,pageColor:'#ffffff',pageOrientation:'portrait',marginTop:6,marginRight:10,marginBottom:6,marginLeft:10,mobileInspector:'properties',inspectorExpanded:false,selected:[],objects:O,name:'Air Waybill — Professional Starter',background:null,bgOpacity:.42,bgLocked:true,bgX:0,bgY:0,bgW:215.9,bgH:279.4,bgFit:'fill',guidesX:[],guidesY:[]};
}
function ensureStarters(){
 let a=templates();if(a.some(t=>t.id===starterId))return;
 a=a.filter(t=>!(t.builtin&&t.name==='Air Waybill — Professional Starter'));
 a.push({id:starterId,name:'Air Waybill — Professional Starter',status:'draft',version:1,category:'Air',placements:[{module:'Shipments',mode:'Air',recordType:'MAWB',surface:'Generate only'}],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),design:awbStarter(),builtin:true});
 saveTemplates(a);
}

const placementLabel=p=>[p.module,p.mode,p.surface].filter(Boolean).join(' · ');
function newTemplate(){const t={id:uid(),name:'Untitled Template',status:'draft',version:1,category:'General',placements:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),design:null};upsertTemplate(t);window.nodaraTemplateStudio?.open(t.id)}
function duplicate(id){const x=getTemplate(id);if(!x)return;const n=structuredClone(x);n.id=uid();n.name=x.name+' Copy';n.status='draft';n.version=1;n.createdAt=n.updatedAt=new Date().toISOString();upsertTemplate(n);render()}
function archive(id){const a=templates(),x=a.find(t=>t.id===id);if(!x)return;x.status=x.status==='archived'?'draft':'archived';x.updatedAt=new Date().toISOString();saveTemplates(a);render()}
function remove(id){const x=getTemplate(id);if(!x)return;if(x.status==='published'){alert('Published templates are archived instead of deleted so historical documents keep their template lineage.');return}if(confirm('Delete this template permanently?')){saveTemplates(templates().filter(t=>t.id!==id));render()}}
function publish(id){const a=templates(),x=a.find(t=>t.id===id);if(!x)return;x.versions=Array.isArray(x.versions)?x.versions:[];x.versions=x.versions.filter(v=>v.version!==x.version);x.versions.push({version:x.version,design:structuredClone(x.design),placements:structuredClone(x.placements||[]),publishedAt:new Date().toISOString()});x.status='published';x.publishedAt=new Date().toISOString();x.updatedAt=x.publishedAt;saveTemplates(a);render()}
function placementEditor(t){const p=t.placements?.[0]||{};return '<div class="dtg-place"><b>Availability</b><label>Module<select data-p="module"><option>Shipments</option><option '+(p.module==='Warehouse'?'selected':'')+'>Warehouse</option><option '+(p.module==='FTZ'?'selected':'')+'>FTZ</option><option '+(p.module==='Transport'?'selected':'')+'>Transport</option><option '+(p.module==='General'?'selected':'')+'>General</option></select></label><label>Mode<select data-p="mode"><option value="">Any</option><option '+(p.mode==='Air'?'selected':'')+'>Air</option><option '+(p.mode==='Ocean'?'selected':'')+'>Ocean</option></select></label><label>Record / document type<input data-p="recordType" value="'+esc(p.recordType||'')+'" placeholder="MAWB, HAWB, WR, CR…"></label><label>Show in<select data-p="surface"><option>Documents</option><option '+(p.surface==='Primary workspace'?'selected':'')+'>Primary workspace</option><option '+(p.surface==='Generate only'?'selected':'')+'>Generate only</option><option '+(p.surface==='Hidden/manual'?'selected':'')+'>Hidden/manual</option></select></label><button data-save-place>Save availability</button></div>'}
function render(){const a=templates(),active=a.filter(x=>x.status!=='archived'),arch=a.filter(x=>x.status==='archived');main.innerHTML='<section class="dtg"><header><div><small>SETTINGS · DOCUMENT TEMPLATES</small><h1>Template Gallery</h1><p>Design once, publish a version, then control exactly where the document is available.</p></div><button data-new>+ New template</button></header><div class="dtg-filters"><input data-search placeholder="Search templates"><select data-filter><option>All</option><option>Air</option><option>Ocean</option><option>Warehouse</option><option>FTZ</option><option>General</option></select></div><div class="dtg-grid">'+active.map(card).join('')+'</div>'+(arch.length?'<details class="dtg-arch"><summary>Archived · '+arch.length+'</summary><div class="dtg-grid">'+arch.map(card).join('')+'</div></details>':'')+'</section>';wire()}
function card(t){const placements=(t.placements||[]).map(placementLabel).filter(Boolean);return '<article class="dtg-card" data-card="'+t.id+'" data-hay="'+esc((t.name+' '+t.category+' '+placements.join(' ')).toLowerCase())+'"><div class="dtg-preview">'+(t.design?'<span>Designed template</span>':'<span>Blank template</span>')+'</div><div class="dtg-cardbody"><small>'+esc(t.category||'General')+' · v'+(t.version||1)+'</small><h3>'+esc(t.name)+'</h3><div class="dtg-status '+t.status+'">'+t.status+'</div><p>'+(placements.length?'Used in: '+esc(placements.join(', ')):'Not assigned yet')+'</p><div class="dtg-actions"><button data-edit>Edit</button><button data-dup>Duplicate</button><button data-placement>Placement</button><button data-publish>'+(t.status==='published'?'Published':'Publish')+'</button><button data-more>•••</button></div><div class="dtg-pop" hidden><button data-archive>'+(t.status==='archived'?'Restore':'Archive')+'</button><button data-delete>Delete</button></div><div class="dtg-placement" hidden>'+placementEditor(t)+'</div></div></article>'}
function wire(){document.querySelector('[data-new]').onclick=newTemplate;document.querySelector('[data-search]').oninput=e=>filter(e.target.value,document.querySelector('[data-filter]').value);document.querySelector('[data-filter]').onchange=e=>filter(document.querySelector('[data-search]').value,e.target.value);document.querySelectorAll('.dtg-card').forEach(c=>{const id=c.dataset.card;c.querySelector('[data-edit]').onclick=()=>window.nodaraTemplateStudio?.open(id);c.querySelector('[data-dup]').onclick=()=>duplicate(id);c.querySelector('[data-placement]').onclick=()=>{const p=c.querySelector('.dtg-placement');p.hidden=!p.hidden};c.querySelector('[data-publish]').onclick=()=>publish(id);c.querySelector('[data-more]').onclick=()=>{const p=c.querySelector('.dtg-pop');p.hidden=!p.hidden};c.querySelector('[data-archive]').onclick=()=>archive(id);c.querySelector('[data-delete]').onclick=()=>remove(id);c.querySelector('[data-save-place]').onclick=()=>{const t=getTemplate(id),p={};c.querySelectorAll('[data-p]').forEach(x=>p[x.dataset.p]=x.value);t.placements=[p];t.category=p.mode||p.module||'General';t.updatedAt=new Date().toISOString();upsertTemplate(t);render()}})}
function filter(q,cat){q=(q||'').toLowerCase();document.querySelectorAll('.dtg-card').forEach(c=>{const t=getTemplate(c.dataset.card),okq=!q||c.dataset.hay.includes(q),okc=cat==='All'||t.category===cat||(t.placements||[]).some(p=>p.module===cat||p.mode===cat);c.style.display=okq&&okc?'':'none'})}
export function openTemplateGallery(){ensureStarters();render()}ensureStarters();window.nodaraTemplateGallery={open:openTemplateGallery,templates,getTemplate,upsertTemplate,applicableTemplates};window.nodaraTemplateRegistry={templates,getTemplate,upsertTemplate,applicableTemplates};