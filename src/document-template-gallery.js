import { supabase } from './supabase-client.js';
const main=document.getElementById('main'),KEY='nodara_template_registry_v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const uid=()=>crypto.randomUUID?.()||'tpl-'+Date.now();
let REGISTRY=[];
export function templates(){return REGISTRY}
export function saveTemplates(a){REGISTRY=a;localStorage.setItem(KEY,JSON.stringify(a));syncRegistry(a)}
async function syncRegistry(a){
 const rows=a.map(t=>({id:t.id,name:t.name,status:t.status||'draft',version:t.version||1,category:t.category||'General',placements:t.placements||[],design:t.design||null,versions:t.versions||[],builtin:!!t.builtin,created_at:t.createdAt||new Date().toISOString(),updated_at:t.updatedAt||new Date().toISOString(),published_at:t.publishedAt||null}));
 if(!rows.length)return;
 const {error}=await supabase.from('document_templates').upsert(rows,{onConflict:'id'});
 if(error)console.error('Template sync failed',error);
}
async function loadRegistry(){
 const {data,error}=await supabase.from('document_templates').select('*').order('updated_at',{ascending:false});
 if(!error&&data){
   REGISTRY=data.map(r=>({id:r.id,name:r.name,status:r.status,version:r.version,category:r.category,placements:r.placements||[],design:r.design,versions:r.versions||[],builtin:r.builtin,createdAt:r.created_at,updatedAt:r.updated_at,publishedAt:r.published_at}));
   const local=(()=>{try{return JSON.parse(localStorage.getItem(KEY))||[]}catch{return[]}})();
   const missing=local.filter(x=>!REGISTRY.some(r=>r.id===x.id));
   if(missing.length){REGISTRY=[...missing,...REGISTRY];await syncRegistry(missing)}
 }else{
   try{REGISTRY=JSON.parse(localStorage.getItem(KEY))||[]}catch{REGISTRY=[]}
 }
 ensureStarters();
 return REGISTRY;
}
export function getTemplate(id){return templates().find(x=>x.id===id)}
export function applicableTemplates(ctx={}){return templates().filter(t=>t.status==='published'&&(t.placements||[]).some(p=>(!ctx.module||p.module===ctx.module)&&(!ctx.mode||!p.mode||p.mode===ctx.mode)&&(!ctx.recordType||!p.recordType||p.recordType===ctx.recordType)&&(!ctx.surface||p.surface===ctx.surface)))}
export function upsertTemplate(t){const a=templates(),i=a.findIndex(x=>x.id===t.id);if(i<0)a.unshift(t);else a[i]=t;saveTemplates(a);return t}

// Built-in editable starters. Seeded once into the local registry; users can freely duplicate/edit them.
const starterId='nodara-system-20260928-awb';
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
 box(107.5,39,97.5,30,'Shipper’s Account Number','shipper.account');
 box(X,69,97.5,30,'Consignee’s Name and Address','consignee.name');variable(X+2,81,92,14,'consignee.address',7,'400');
 box(107.5,69,97.5,30,'Consignee’s Account Number','consignee.account');
 // Agent/accounting
 box(X,99,97.5,24,'Issuing Carrier’s Agent Name and City','company.name');variable(X+2,111,92,8,'company.address',6,'400');
 frame(107.5,99,97.5,24);text(109.5,100,93,4,'Accounting Information',5);variable(109.5,106,93,14,'awb.accounting_info',6,'400');
 // Routing top
 frame(X,123,W,29);
 text(12,124,27,4,'Airport of Departure',5);variable(12,130,28,7,'booking.origin',9,'700');
 text(42,124,22,4,'To',5);variable(42,130,22,7,'booking.destination',9,'700');
 text(66,124,30,4,'By First Carrier',5);variable(66,130,30,7,'booking.flight',8,'600');
 text(99,124,24,4,'Routing / To',5);variable(99,130,24,7,'awb.route_1',7,'600');text(125,124,24,4,'By',5);variable(125,130,24,7,'awb.carrier_2',7,'600');text(151,124,24,4,'To',5);variable(151,130,24,7,'awb.route_2',7,'600');text(177,124,26,4,'By',5);variable(177,130,26,7,'awb.carrier_3',7,'600');
 line(X,139,W);text(12,141,18,4,'Currency',5);variable(12,146,18,5,'awb.currency',7,'600');text(32,141,18,4,'CHGS',5);variable(32,146,18,5,'awb.charges_code',7,'600');text(52,141,25,4,'WT/VAL',5);variable(52,146,25,5,'awb.wt_val',6,'600');text(79,141,25,4,'Other',5);variable(79,146,25,5,'awb.other_ppd_coll',6,'600');text(106,141,44,4,'Declared Value for Carriage',5);variable(106,146,44,5,'awb.declared_carriage',7,'600','center');text(152,141,51,4,'Declared Value for Customs',5);variable(152,146,51,5,'awb.declared_customs',7,'600','center');
 // Destination/flight
 frame(X,152,W,18);text(12,153,38,4,'Airport of Destination',5);variable(12,159,38,7,'booking.destination',9,'700');text(52,153,32,4,'Requested Flight/Date',5);variable(52,159,46,7,'booking.flight',8,'600');variable(101,159,48,7,'booking.etd',7,'400');text(152,153,51,4,'Amount of Insurance',5);variable(152,159,51,7,'awb.insurance',7,'600','center');
 // Handling
 frame(X,170,W,22);text(12,171,60,4,'Handling Information',5);variable(12,177,189,11,'awb.handling',7,'400');
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
function systemDocDesign(id,name,orientation='portrait',kind='generic'){
 const landscape=orientation==='landscape',W=landscape?279.4:215.9,H=landscape?215.9:279.4,O=[];let n=0;
 const base=(type,x,y,w,h,extra={})=>O.push({id:id+'-'+(n++),type,x,y,w,h,text:'',fontSize:7,fontFamily:'Arial',fontWeight:'400',fontStyle:'normal',textColor:'#111111',fillColor:'transparent',borderColor:'#111111',align:'left',border:.55,...extra});
 const text=(x,y,w,h,t,s=6,wt='400',al='left')=>base('text',x,y,w,h,{text:t,fontSize:s,fontWeight:wt,align:al,border:0});
 const v=(x,y,w,h,b,s=7,wt='500',al='left')=>base('variable',x,y,w,h,{text:'{{'+b+'}}',binding:b,fontSize:s,fontWeight:wt,align:al,border:0});
 const frame=(x,y,w,h)=>base('frame',x,y,w,h);
 const line=(x,y,w)=>base('line',x,y,w,.3,{border:.55});
 const field=(x,y,w,h,label,binding)=>{frame(x,y,w,h);text(x+1.5,y+1,w-3,4,label,4.7,'500');if(binding)v(x+1.5,y+6,w-3,h-7,binding,7,'500')};
 const table=(x,y,w,h,cols,labels,bindings=[])=>{frame(x,y,w,h);let xx=x;cols.slice(0,-1).forEach(c=>{xx+=c;frame(xx,y,.2,h)});let cx=x;cols.forEach((c,i)=>{text(cx+1,y+1,c-2,5,labels[i]||'',4.6,'600','center');if(bindings[i])v(cx+1,y+8,c-2,Math.max(7,h-10),bindings[i],6,'400');cx+=c})};
 if(kind==='manifest'){
  text(8,7,90,8,'{{company.name}}',10,'700');text(W-78,7,70,8,'Cargo Manifest',14,'700','right');
  field(8,22,62,24,'Destination Agent Name and Address','agent.name');v(10,34,58,9,'agent.address',5.7);field(70,22,62,24,'Carrier Name and Address','booking.first_carrier');
  field(132,22,48,12,'AWB / Bill of Lading No.','booking.reference');field(180,22,45,12,'Date','execution.date');field(225,22,46,12,'Origin','booking.origin');
  field(132,34,48,12,'Flight / Voyage','booking.flight');field(180,34,45,12,'Departure Date','booking.etd');field(225,34,46,12,'Destination','booking.destination');
  field(8,46,W-16,16,'Notes','awb.remarks');
  table(8,62,W-16,H-82,[27,52,52,16,22,22,43,37],['House Number','Shipper Name','Consignee Name','Pieces','Weight','Volume','Nature and Quantity of Goods','U.S Customs'],['booking.hawb_number','shipper.name','consignee.name','cargo.total_pieces','cargo.gross_weight','cargo.volume_cbm','cargo.description','awb.aes_itn']);
  text(10,H-17,30,6,'TOTAL',7,'700');v(140,H-17,18,6,'cargo.total_pieces',7,'700');v(160,H-17,28,6,'cargo.gross_weight',7,'700');v(190,H-17,28,6,'cargo.volume_cbm',7,'700');
 }else if(kind==='loading'){
  text(8,8,85,8,'{{company.name}}',10,'700');text(W-78,8,70,8,'Loading Guide',14,'700','right');
  field(108,18,48,14,'Date','execution.date');field(156,18,48,14,'Container No.','shipment.reference');
  field(108,32,48,14,'AWB / Bill of Lading No.','booking.reference');field(156,32,48,14,'Booking Number','booking.reference');
  field(8,46,100,26,'Shipper Name and Address','shipper.name');v(10,57,96,6,'shipper.address',5.8);v(10,64,96,6,'shipper.contact_name',5.5);
  field(108,46,48,13,'Origin','booking.origin');field(156,46,48,13,'Destination','booking.destination');field(108,59,96,13,'Carrier Name','booking.first_carrier');
  field(8,72,100,26,'Consignee Name and Address','consignee.name');v(10,83,96,6,'consignee.address',5.8);v(10,90,96,6,'consignee.contact_name',5.5);field(108,72,96,26,'Notes','awb.remarks');
  table(8,98,W-16,H-118,[20,20,20,20,75,25,27],['WR No.','Type','Pieces','Location','Description','Weight','Volume'],['shipment.reference','','cargo.total_pieces','','cargo.description','cargo.gross_weight','cargo.volume_cbm']);
 }else if(kind==='bol'){
  text(8,6,105,8,'{{company.name}}',10,'700');text(W-80,6,72,8,'BILL OF LADING',13,'700','right');line(8,15,W-16);
  field(8,16,105,27,'2. EXPORTER','shipper.name');v(10,29,100,10,'shipper.address',6);field(113,16,48,13,'5. DOCUMENT NUMBER','shipment.number');field(161,16,46,13,'5a. B/L NUMBER','booking.reference');field(113,29,94,14,'6. EXPORT REFERENCES','shipment.reference');
  field(8,43,105,28,'3. CONSIGNED TO','consignee.name');v(10,56,100,10,'consignee.address',6);field(113,43,94,14,'7. FORWARDING AGENT','agent.name');field(113,57,94,14,'8. POINT OF ORIGIN','booking.origin');
  field(8,71,105,27,'4. NOTIFY PARTY / INTERMEDIATE CONSIGNEE','consignee.contact_name');field(113,71,94,27,'9. DOMESTIC ROUTING / EXPORT INSTRUCTIONS','awb.handling');
  field(8,98,53,15,'12. PRE-CARRIAGE BY','booking.first_carrier');field(61,98,52,15,'13. PLACE OF RECEIPT','booking.origin');field(113,98,47,15,'10. LOADING PIER / TERMINAL','booking.origin');field(160,98,47,15,'11. TYPE OF MOVE','shipment.reference');
  field(8,113,53,15,'14. EXPORTING CARRIER','booking.first_carrier');field(61,113,52,15,'15. PORT OF LOADING','booking.origin');field(113,113,47,15,'16. PORT OF UNLOADING','booking.destination');field(160,113,47,15,'17. PLACE OF DELIVERY','booking.destination');
  table(8,128,W-16,92,[37,22,88,28,32],['MARKS AND NUMBERS','NUMBER OF PACKAGES','DESCRIPTION OF COMMODITIES','GROSS WEIGHT','MEASUREMENT'],['shipment.reference','cargo.total_pieces','cargo.description','cargo.gross_weight','cargo.volume_cbm']);
  field(8,225,100,32,'FREIGHT RATES, CHARGES, WEIGHTS AND/OR MEASUREMENTS','charges.other');field(108,225,99,32,'DECLARED VALUE / CARRIER CERTIFICATION','execution.authorized_agent');
 }else if(kind==='vgm'){
  text(10,8,W-20,10,'VGM DECLARATION',16,'700','center');
  const rows=[['Carrier','booking.first_carrier'],['MBL No.','booking.reference'],['Booking No.','booking.reference'],['Container / Seal','ocean.container_seal'],['Container Type','ocean.container_type'],['Container Tare Weight','ocean.container_tare_weight'],['Cargo Weight','cargo.gross_weight'],['VGM','ocean.vgm_weight'],['Verifying Party','execution.authorized_agent'],['Signature (Name)','execution.authorized_agent'],['Phone','execution.authorized_agent_phone'],['Verification Date','execution.date']];
  rows.forEach((r,i)=>field(18,28+i*13,W-36,13,r[0],r[1]));text(18,190,W-36,7,'The method used to get the VGM of this container was:',7,'600');text(18,201,W-36,7,'☐ Method 1: Weighing the packed container',7);text(18,212,W-36,14,'☐ Method 2: Weighing all cargo and contents, including pallets/dunnage, and adding container tare weight',7);
 }else if(kind==='arrival'){
  text(8,7,78,9,'{{company.name}}',13,'700');text(W-103,7,95,9,'ARRIVAL NOTICE / INVOICE',15,'700','right');v(8,17,78,12,'company.address',6);
  field(8,31,98,27,'CONSIGNEE','consignee.name');v(10,42,94,7,'consignee.address',5.8);v(10,50,94,6,'consignee.contact_name',5.4);field(106,31,101,27,'BILL TO','customer.name');v(108,42,97,7,'customer.address',5.8);v(108,50,97,6,'customer.contact_name',5.4);
  field(8,58,98,27,'NOTIFY PARTY','consignee.contact_name');v(10,70,94,9,'consignee.contact_email',5.5);field(106,58,101,27,'SHIPPER','shipper.name');v(108,69,97,7,'shipper.address',5.8);v(108,77,97,6,'shipper.contact_name',5.4);
  const f=[['DEPARTURE DATE','booking.etd'],['ARRIVAL DATE','booking.eta'],['PORT OF LOADING','booking.origin'],['PORT OF UNLOADING','booking.destination'],['CARRIER','booking.first_carrier'],['FLIGHT DATE / NUMBER','booking.flight'],['MASTER AIR WAYBILL','booking.mawb_number'],['HOUSE AIR WAYBILL','booking.hawb_number']];
  f.forEach((r,i)=>field(8+(i%4)*49.75,85+Math.floor(i/4)*15,49.75,15,r[0],r[1]));
  table(8,115,W-16,82,[28,82,32,28,29],['NUMBER OF PACKAGES','DESCRIPTION OF COMMODITIES','GROSS WEIGHT','CHARGEABLE WEIGHT','MEASUREMENT'],['cargo.total_pieces','cargo.description','cargo.gross_weight','cargo.chargeable_weight','cargo.volume_cbm']);
  field(8,201,96,24,'CARGO LOCATION','shipment.reference');field(104,201,73,24,'DESCRIPTION OF CHARGES','charges.other');field(177,201,30,24,'AMOUNT','charges.collect_total');field(8,225,96,20,'PLACE OF DELIVERY','booking.destination');field(8,245,96,20,'NOTES','awb.remarks');
 }else if(kind==='do'){
  text(8,7,70,7,'{{company.name}}',9,'700');text(W-88,7,80,9,'Delivery Order (DO) - Export',14,'700','right');
  field(8,20,95,18,'Pickup From','shipper.address');field(103,20,104,18,'Deliver To','consignee.address');field(8,38,95,25,'Shipper (Name and Address)','shipper.name');v(10,49,91,7,'shipper.address',5.7);v(10,56,91,5,'shipper.contact_name',5.2);field(103,38,104,25,'Consignee (Name and Address)','consignee.name');v(105,49,100,7,'consignee.address',5.7);v(105,56,100,5,'consignee.contact_name',5.2);
  const fs=[['Flight / Voyage','booking.flight'],['File Number','shipment.number'],['Port of Discharge','booking.destination'],['Booking Number','booking.reference'],['House Number','booking.hawb_number'],['Delivering Carrier','booking.first_carrier'],['Bill To Party','customer.name'],['Customer Reference','customer.reference']];
  fs.forEach((r,i)=>field(8+(i%4)*49.75,63+Math.floor(i/4)*14,49.75,14,r[0],r[1]));
  table(8,91,W-16,85,[28,20,91,30,30],['Marks and Numbers','Pieces','Description','Weight','Vol / Chargeable Weight'],['shipment.reference','cargo.total_pieces','cargo.description','cargo.gross_weight','cargo.chargeable_weight']);
  field(8,180,W-16,28,'Special Instructions','awb.handling');field(8,212,96,30,'Return To','company.address');field(104,212,103,30,'Received Signature / Date','execution.authorized_agent');
 }else if(kind==='tsa'){
  text(10,8,W-20,18,name.toUpperCase(),11,'700','center');v(10,30,W-20,10,'company.name',9,'700','center');v(10,41,W-20,10,'company.address',6,'400','center');
  field(10,58,64,15,'Origin','booking.origin');field(74,58,64,15,'Destination','booking.destination');field(138,58,67,15,'Date','execution.date');
  field(10,73,97,15,'Master Airway Bill No.','booking.mawb_number');field(107,73,48,15,'Number of Pieces','cargo.total_pieces');field(155,73,50,15,'Weight Kg','cargo.gross_weight');
  field(10,88,195,18,'Name of IAC / Authorized Agent employee tendering cargo','execution.authorized_agent');
  const passenger=/Passenger/i.test(name);
  text(10,112,195,10,passenger?'INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR A PASSENGER AIR CARRIER':'INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR AN ALL CARGO AIRCRAFT ONLY',8,'700','center');
  text(10,126,195,48,passenger?'MIP Cargo Express is in compliance with its TSA-approved security program and all applicable security directives. All cargo tendered with this certification must meet the applicable TSA acceptance and transfer requirements.':'MIP Cargo Express is in compliance with its TSA-approved security program and all applicable security directives. This shipment contains cargo originating from an UNKNOWN SHIPPER not exempted by TSA. This shipment must be transported ONLY ON ALL-CARGO AIRCRAFT.',6.5,'400');
  if(passenger){field(10,178,96,14,'Number of Known Shipper','shipper.account');field(106,178,99,14,'Items less than 16 oz.','cargo.total_pieces')}
  line(10,205,90);text(10,207,90,5,'Printed Name and Signature of IAC Employee',5);line(115,205,90);text(115,207,90,5,'Date',5);
  text(10,226,195,34,'Sensitive security information: maintain and disclose this record only in accordance with the organization’s approved security program and applicable SSI handling requirements.',5.5,'400');
 }else{
  text(10,8,W-20,10,name,15,'700','center');
 }
 return {zoom:.72,testMode:false,grid:1,snap:true,mobilePanel:null,pagePreset:landscape?'CUSTOM':'LETTER',pageW:W,pageH:H,pageColor:'#ffffff',pageOrientation:orientation,marginTop:6,marginRight:8,marginBottom:6,marginLeft:8,mobileInspector:'properties',inspectorExpanded:false,selected:[],objects:O,name,background:null,bgOpacity:.3,bgLocked:true,bgX:0,bgY:0,bgW:W,bgH:H,bgFit:'fill',guidesX:[],guidesY:[]};
}
function ensureStarters(){
 let a=templates();
 const now=new Date().toISOString();
 // Remove only NODARA's superseded built-in starters. User-created/custom templates are preserved.
 a=a.filter(t=>!t.builtin || String(t.id||'').startsWith('nodara-system-20260928-'));
 // Retire older generated starter records so the gallery has one authoritative NODARA base per document.
 a=a.filter(t=>!(t.builtin && ['starter-awb-professional-v3','Air Waybill — Professional Starter'].includes(String(t.id||t.name||''))));
 const defs=[
  ['nodara-system-20260928-awb','Air Waybill — NODARA Base','Air','portrait','awb',[{module:'Shipments',mode:'Air',recordType:'MAWB',surface:'Documents'},{module:'Shipments',mode:'Air',recordType:'HAWB',surface:'Documents'}]],
  ['nodara-system-20260928-bol','Bill of Lading — NODARA Base','Ocean','portrait','bol',[{module:'Shipments',mode:'Ocean',recordType:'HBL',surface:'Documents'}]],
  ['nodara-system-20260928-manifest','Cargo Manifest — NODARA Base','General','landscape','manifest',[{module:'Shipments',mode:'Air',recordType:'AIR_MANIFEST',surface:'Documents'},{module:'Shipments',mode:'Ocean',recordType:'OCEAN_MANIFEST',surface:'Documents'}]],
  ['nodara-system-20260928-loading','Loading Guide — NODARA Base','General','portrait','loading',[{module:'Shipments',mode:'Air',recordType:'LOADING_GUIDE',surface:'Documents'},{module:'Shipments',mode:'Ocean',recordType:'LOADING_GUIDE',surface:'Documents'}]],
  ['nodara-system-20260928-tsa-unknown','TSA Security Certification — Unknown Shipper','Air','portrait','tsa',[{module:'Shipments',mode:'Air',recordType:'KNOWN_SHIPPER_LETTER',surface:'Documents'}]],
  ['nodara-system-20260928-tsa-passenger','TSA Security Certification — Passenger','Air','portrait','tsa',[{module:'Shipments',mode:'Air',recordType:'TSA_SECURITY_LETTER',surface:'Documents'}]],
  ['nodara-system-20260928-vgm','VGM Declaration — NODARA Base','Ocean','portrait','vgm',[{module:'Shipments',mode:'Ocean',recordType:'VGM',surface:'Documents'}]],
  ['nodara-system-20260928-do','Delivery Order — Export — NODARA Base','General','portrait','do',[{module:'Shipments',mode:'Air',recordType:'DELIVERY_ORDER',surface:'Documents'},{module:'Shipments',mode:'Ocean',recordType:'DELIVERY_ORDER',surface:'Documents'}]],
  ['nodara-system-20260928-arrival','Arrival Notice / Invoice — Air — NODARA Base','Air','portrait','arrival',[{module:'Shipments',mode:'Air',recordType:'ARRIVAL_NOTICE',surface:'Documents'}]]
 ];
 defs.forEach(([id,name,category,orientation,kind,placements])=>{
   if(a.some(t=>t.id===id))return;
   const design=kind==='awb'?awbStarter():systemDocDesign(id,name,orientation,kind);
   design.name=name;
   a.push({id,name,status:'published',version:1,category,placements,createdAt:now,updatedAt:now,publishedAt:now,design,builtin:true,source:'Magaya reference template supplied 2026-09-28'});
 });
 saveTemplates(a);
}

const placementLabel=p=>[p.module,p.mode,p.surface].filter(Boolean).join(' · ');
function newTemplate(){const t={id:uid(),name:'Untitled Template',status:'draft',version:1,category:'General',placements:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),design:null};upsertTemplate(t);window.nodaraTemplateStudio?.open(t.id)}
function duplicate(id){const x=getTemplate(id);if(!x)return;const n=structuredClone(x);n.id=uid();n.name=x.name+' Copy';n.status='draft';n.version=1;n.createdAt=n.updatedAt=new Date().toISOString();upsertTemplate(n);render()}
function archive(id){const a=templates(),x=a.find(t=>t.id===id);if(!x)return;x.status=x.status==='archived'?'draft':'archived';x.updatedAt=new Date().toISOString();saveTemplates(a);render()}
async function remove(id){const x=getTemplate(id);if(!x)return;if(x.status==='published'){alert('Published templates are archived instead of deleted so historical documents keep their template lineage.');return}if(confirm('Delete this template permanently?')){REGISTRY=templates().filter(t=>t.id!==id);localStorage.setItem(KEY,JSON.stringify(REGISTRY));await supabase.from('document_templates').delete().eq('id',id);render()}}
function publish(id){const a=templates(),x=a.find(t=>t.id===id);if(!x)return;x.versions=Array.isArray(x.versions)?x.versions:[];x.versions=x.versions.filter(v=>v.version!==x.version);x.versions.push({version:x.version,design:structuredClone(x.design),placements:structuredClone(x.placements||[]),publishedAt:new Date().toISOString()});x.status='published';x.publishedAt=new Date().toISOString();x.updatedAt=x.publishedAt;saveTemplates(a);render()}
function placementEditor(t){
 const ps=(t.placements&&t.placements.length?t.placements:[{module:'Shipments',mode:'Air',recordType:'MAWB',surface:'Generate only'}]);
 const opts=(vals,v)=>vals.map(x=>'<option '+(x===v?'selected':'')+'>'+x+'</option>').join('');
 const row=(p,i)=>'<div class="dtg-place-row" data-place-row><label>Module<select data-p="module">'+opts(['Shipments','Warehouse','FTZ','Transport','General'],p.module||'Shipments')+'</select></label><label>Mode<select data-p="mode"><option value="">Any</option>'+opts(['Air','Ocean'],p.mode||'')+'</select></label><label>Record / document type<input data-p="recordType" value="'+esc(p.recordType||'')+'" placeholder="MAWB, HAWB, WR, CR…"></label><label>Show in<select data-p="surface">'+opts(['Documents','Primary workspace','Generate only','Hidden/manual'],p.surface||'Documents')+'</select></label><button type="button" data-remove-place title="Remove placement">×</button></div>';
 return '<div class="dtg-place"><b>Availability</b><p class="dtg-place-help">A template can be available in multiple workflows. Add every context where this document should appear.</p><div data-place-rows>'+ps.map(row).join('')+'</div><div class="dtg-place-actions"><button type="button" data-add-place>+ Add placement</button><button type="button" data-save-place>Save availability</button></div></div>'
}
function render(){const a=templates(),active=a.filter(x=>x.status!=='archived'),arch=a.filter(x=>x.status==='archived');main.innerHTML='<section class="dtg"><header><div><small>SETTINGS · DOCUMENT TEMPLATES</small><h1>Template Gallery</h1><p>Design once, publish a version, then control exactly where the document is available.</p></div><button data-new>+ New template</button></header><div class="dtg-filters"><input data-search placeholder="Search templates"><select data-filter><option>All</option><option>Air</option><option>Ocean</option><option>Warehouse</option><option>FTZ</option><option>General</option></select></div><div class="dtg-grid">'+active.map(card).join('')+'</div>'+(arch.length?'<details class="dtg-arch"><summary>Archived · '+arch.length+'</summary><div class="dtg-grid">'+arch.map(card).join('')+'</div></details>':'')+'</section>';wire()}
function card(t){const placements=(t.placements||[]).map(placementLabel).filter(Boolean);return '<article class="dtg-card" data-card="'+t.id+'" data-hay="'+esc((t.name+' '+t.category+' '+placements.join(' ')).toLowerCase())+'"><div class="dtg-preview">'+(t.design?'<span>Designed template</span>':'<span>Blank template</span>')+'</div><div class="dtg-cardbody"><small>'+esc(t.category||'General')+' · v'+(t.version||1)+'</small><h3>'+esc(t.name)+'</h3><div class="dtg-status '+t.status+'">'+t.status+'</div><p>'+(placements.length?'Used in: '+esc(placements.join(', ')):'Not assigned yet')+'</p><div class="dtg-actions"><button data-edit>Edit</button><button data-dup>Duplicate</button><button data-placement>Placement</button><button data-publish>'+(t.status==='published'?'Published':'Publish')+'</button><button data-more>•••</button></div><div class="dtg-pop" hidden><button data-archive>'+(t.status==='archived'?'Restore':'Archive')+'</button><button data-delete>Delete</button></div><div class="dtg-placement" hidden>'+placementEditor(t)+'</div></div></article>'}
function wire(){document.querySelector('[data-new]').onclick=newTemplate;document.querySelector('[data-search]').oninput=e=>filter(e.target.value,document.querySelector('[data-filter]').value);document.querySelector('[data-filter]').onchange=e=>filter(document.querySelector('[data-search]').value,e.target.value);document.querySelectorAll('.dtg-card').forEach(c=>{const id=c.dataset.card;c.querySelector('[data-edit]').onclick=()=>window.nodaraTemplateStudio?.open(id);c.querySelector('[data-dup]').onclick=()=>duplicate(id);c.querySelector('[data-placement]').onclick=()=>{const p=c.querySelector('.dtg-placement');p.hidden=!p.hidden};c.querySelector('[data-publish]').onclick=()=>publish(id);c.querySelector('[data-more]').onclick=()=>{const p=c.querySelector('.dtg-pop');p.hidden=!p.hidden};c.querySelector('[data-archive]').onclick=()=>archive(id);c.querySelector('[data-delete]').onclick=()=>remove(id);const rows=c.querySelector('[data-place-rows]');c.querySelector('[data-add-place]').onclick=()=>{const d=document.createElement('div');d.innerHTML=placementEditor({...getTemplate(id),placements:[{module:'Shipments',mode:'Air',recordType:'MAWB',surface:'Generate only'}]});rows.appendChild(d.querySelector('[data-place-row]'));bindRemove()};const bindRemove=()=>c.querySelectorAll('[data-remove-place]').forEach(b=>b.onclick=()=>{if(c.querySelectorAll('[data-place-row]').length>1)b.closest('[data-place-row]').remove()});bindRemove();c.querySelector('[data-save-place]').onclick=()=>{const t=getTemplate(id);t.placements=[...c.querySelectorAll('[data-place-row]')].map(r=>{const p={};r.querySelectorAll('[data-p]').forEach(x=>p[x.dataset.p]=x.value);return p});t.category=t.placements[0]?.mode||t.placements[0]?.module||'General';t.updatedAt=new Date().toISOString();upsertTemplate(t);render()}})}
function filter(q,cat){q=(q||'').toLowerCase();document.querySelectorAll('.dtg-card').forEach(c=>{const t=getTemplate(c.dataset.card),okq=!q||c.dataset.hay.includes(q),okc=cat==='All'||t.category===cat||(t.placements||[]).some(p=>p.module===cat||p.mode===cat);c.style.display=okq&&okc?'':'none'})}
export async function openTemplateGallery(){await loadRegistry();render()}loadRegistry();window.nodaraTemplateGallery={open:openTemplateGallery,templates,getTemplate,upsertTemplate,applicableTemplates};window.nodaraTemplateRegistry={templates,getTemplate,upsertTemplate,applicableTemplates};