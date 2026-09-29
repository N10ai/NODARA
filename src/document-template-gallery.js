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
 // AWB identity strip exactly follows the supplied reference.
 variable(10,3,12,6,'booking.mawb_prefix',9,'700','center');variable(23,3,12,6,'booking.origin',9,'700','center');variable(36,3,38,6,'booking.mawb_serial',9,'700');
 variable(153,3,13,6,'booking.mawb_prefix',9,'700','center');variable(168,3,37,6,'booking.mawb_serial',9,'700','right');

 // Main face: left party column / right carrier-contract column.
 frame(10,10,195,186);
 frame(10,10,95,38); text(11,11,47,4,'Shipper Name and Address',4.8);variable(12,17,61,9,'shipper.name',7,'600');variable(12,27,89,16,'shipper.address',6,'400');
 frame(58,10,47,12);text(59,11,45,4,"Shipper's Account Number",4.8);variable(60,16,43,5,'shipper.account',6,'600');
 frame(105,10,100,38);text(107,11,42,4,'Not Negotiable',4.8);text(107,16,42,7,'Air Waybill',12,'700');text(107,25,18,4,'Issued By',4.8);variable(126,23,77,8,'company.name',7,'600');
 text(107,34,96,10,'Copies 1, 2 and 3 of this Air Waybill are originals and have the same validity.',4.5);

 frame(10,48,95,38);text(11,49,47,4,'Consignee Name and Address',4.8);variable(12,55,61,9,'consignee.name',7,'600');variable(12,65,89,16,'consignee.address',6,'400');
 frame(58,48,47,12);text(59,49,45,4,"Consignee's Account Number",4.8);variable(60,54,43,5,'consignee.account',6,'600');
 frame(105,48,100,38);text(107,49,96,30,'It is agreed that the goods described herein are accepted in apparent good order and condition (except as noted) for carriage SUBJECT TO THE CONDITIONS OF CONTRACT ON THE REVERSE HEREOF. Shipper may increase such limitation of liability by declaring a higher value for carriage and paying a supplemental charge if required.',4.3);

 frame(10,86,95,26);text(11,87,91,4,"Issuing Carrier's Agent Name and City",4.8);variable(12,93,91,7,'company.name',6.5,'600');variable(12,101,91,7,'company.address',5.5,'400');
 frame(105,86,100,26);text(107,87,96,4,'Accounting Information',4.8);variable(107,93,96,15,'awb.accounting_info',6,'400');
 frame(10,112,48,14);text(11,113,45,4,"Agent's IATA Code",4.8);variable(12,119,44,5,'company.iata_code',6,'600');
 frame(58,112,47,14);text(59,113,44,4,'Account No.',4.8);variable(60,119,43,5,'company.account_number',6,'600');
 frame(105,112,100,14);text(107,113,52,4,'Reference Number',4.8);variable(107,119,45,5,'awb.reference_number',6,'600');text(157,113,46,4,'Optional Shipping Information',4.5);variable(157,119,46,5,'awb.optional_shipping_info',5.5,'400');

 frame(10,126,95,16);text(11,127,91,4,'Airport of Departure (Addr. of First Carrier) and Requested Routing',4.5);variable(12,133,91,6,'booking.origin',7,'600');
 frame(105,126,100,16);
 text(107,127,9,4,'To',4.5);variable(107,133,11,6,'booking.destination',6,'600');text(120,127,23,4,'By First Carrier',4.5);variable(120,133,28,6,'booking.first_carrier',6,'600');text(150,127,8,4,'to',4.5);variable(150,133,10,6,'awb.route_1',5.5,'600');text(162,127,8,4,'by',4.5);variable(162,133,15,6,'awb.carrier_2',5.5,'600');text(179,127,8,4,'to',4.5);variable(179,133,10,6,'awb.route_2',5.5,'600');text(191,127,8,4,'by',4.5);variable(191,133,12,6,'awb.carrier_3',5.5,'600');

 frame(10,142,195,14);
 text(11,143,16,4,'Currency',4.3);variable(11,149,16,5,'awb.currency',6,'600','center');text(29,143,16,4,'CHGS Code',4.3);variable(29,149,16,5,'awb.charges_code',5.5,'600','center');
 text(47,143,27,4,'WT/VAL PPD/COLL',4.1);variable(47,149,27,5,'awb.wt_val',5.5,'600','center');text(76,143,27,4,'Other PPD/COLL',4.1);variable(76,149,27,5,'awb.other_ppd_coll',5.5,'600','center');
 text(105,143,49,4,'Declared Value for Carriage',4.3,'400','center');variable(105,149,49,5,'awb.declared_carriage',6,'600','center');text(156,143,48,4,'Declared Value for Customs',4.3,'400','center');variable(156,149,48,5,'awb.declared_customs',6,'600','center');

 frame(10,156,195,16);text(11,157,36,4,'Airport of Destination',4.5);variable(11,163,36,6,'booking.destination',6.5,'600');
 text(49,157,25,4,'Flight Date',4.5);variable(49,163,25,6,'booking.flight_date',5.5,'600');text(76,157,31,4,'For Carrier Use Only',4.2);text(109,157,22,4,'Flight Date',4.5);variable(109,163,22,6,'booking.flight',5.5,'600');
 text(133,157,25,4,'Amount of Insurance',4.2);variable(133,163,25,6,'awb.insurance',5.5,'600');text(160,157,43,11,'INSURANCE - If carrier offers insurance, and such insurance is requested in accordance with the conditions thereof.',3.8);

 frame(10,172,195,24);text(11,173,48,4,'Handling Information',4.8);variable(11,179,165,13,'awb.handling',5.5,'400');text(190,186,13,4,'SCI',4.5,'400','center');variable(190,190,13,5,'awb.sci',5.5,'600','center');

 // Cargo rating grid, matching the standard AWB column order.
 frame(10,196,195,72);
 const cx=[10,21,40,46,65,91,113,139,171,205];for(let i=1;i<cx.length-1;i++)frame(cx[i],196,.2,72,.5);
 const labs=[['No. of Pieces RCP',10,11],['Gross Weight',21,19],['kg/lb',40,6],['Rate Class / Commodity Item No.',46,19],['Chargeable Weight',65,26],['Rate / Charge',91,22],['Total',113,26],['Nature and Quantity of Goods (incl. Dimensions or Volume)',139,66]];
 labs.forEach(z=>text(z[1]+.7,198,z[2]-1.4,10,z[0],4.1,'500','center'));
 variable(11,211,9,8,'cargo.total_pieces',6.5,'600','center');variable(22,211,17,8,'cargo.gross_weight',6,'600','center');text(41,211,4,7,'K',5.5,'600','center');variable(66,211,24,8,'cargo.chargeable_weight',6,'600','center');variable(140,210,63,48,'cargo.description',5.3,'400');

 // Charges and certification footer.
 frame(10,268,74,29);text(11,269,22,4,'Prepaid',4.2,'400','center');text(34,269,25,4,'Weight Charge',4.2,'400','center');text(60,269,23,4,'Collect',4.2,'400','center');line(10,278,74);text(11,280,72,4,'Valuation Charge',4.2,'400','center');line(10,287,74);text(11,289,72,4,'Tax',4.2,'400','center');
 frame(84,268,121,29);text(85,269,119,4,'Other Charges',4.5);variable(86,276,117,17,'awb.other_charges',5.5,'400');
 frame(10,297,74,25);text(11,298,72,4,'Total Other Charges Due Agent',4.1,'400','center');line(10,306,74);text(11,308,72,4,'Total Other Charges Due Carrier',4.1,'400','center');
 frame(84,297,121,25);text(86,298,117,13,'Shipper certifies that the particulars on the face hereof are correct and that insofar as any part of the consignment contains dangerous goods, such part is properly described by name and is in proper condition for carriage according to the applicable Dangerous Goods Regulations.',4.2);variable(86,313,60,6,'company.name',6,'600');variable(147,313,56,6,'execution.authorized_agent',5.5,'600','right');
 frame(10,322,74,22);text(11,323,35,4,'Total Prepaid',4.1,'400','center');text(48,323,35,4,'Total Collect',4.1,'400','center');line(10,333,74);text(11,335,35,4,'Currency Conversion Rates',3.9,'400','center');text(48,335,35,4,'CC Charges in Dest. Currency',3.9,'400','center');
 frame(84,322,121,22);variable(86,325,34,6,'execution.issue_date',5.5,'600');variable(122,325,37,6,'execution.issue_place',5.5,'600','center');variable(161,325,42,6,'execution.authorized_agent',5.5,'600','right');line(86,333,117);text(86,335,117,4,'Executed on (date) · at (place) · Signature of Issuing Carrier or its Agent',3.9,'400','center');
 frame(10,344,74,13);text(11,345,35,4,"For Carrier's Use only at Destination",3.8,'400','center');text(48,345,35,4,'Charges at Destination',3.8,'400','center');
 frame(84,344,55,13);text(85,345,53,4,'Total Collect Charges',3.9,'400','center');
 variable(153,348,13,6,'booking.mawb_prefix',8,'700','center');variable(168,348,35,6,'booking.mawb_serial',8,'700','right');
 // Fit the industry AWB architecture cleanly on US Letter while preserving editable geometry.
 O.forEach(o=>{
   o.y=+(o.y*.735).toFixed(2);
   o.h=+(Math.max(o.type==='line' ? .3 : o.h*.735,.3)).toFixed(2);
 });
 return {zoom:.72,testMode:false,grid:1,snap:true,mobilePanel:null,pagePreset:'LETTER',pageW:215.9,pageH:279.4,pageColor:'#ffffff',pageOrientation:'portrait',marginTop:6,marginRight:10,marginBottom:6,marginLeft:10,mobileInspector:'properties',inspectorExpanded:false,selected:[],objects:O,name:'Air Waybill — Magaya Base',background:null,bgOpacity:.42,bgLocked:true,bgX:0,bgY:0,bgW:215.9,bgH:279.4,bgFit:'fill',guidesX:[],guidesY:[]};
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
  field(8,20,95,18,'Pickup From','delivery.pickup_address');field(103,20,104,18,'Deliver To','delivery.address');field(8,38,95,25,'Shipper (Name and Address)','shipper.name');v(10,49,91,7,'shipper.address',5.7);v(10,56,91,5,'shipper.contact_name',5.2);field(103,38,104,25,'Consignee (Name and Address)','consignee.name');v(105,49,100,7,'consignee.address',5.7);v(105,56,100,5,'consignee.contact_name',5.2);
  const fs=[['Flight / Voyage','booking.flight'],['File Number','shipment.number'],['Port of Discharge','booking.destination'],['Booking Number','booking.reference'],['House Number','booking.hawb_number'],['Delivering Carrier','delivery.carrier'],['Bill To Party','customer.name'],['Customer Reference','customer.reference']];
  fs.forEach((r,i)=>field(8+(i%4)*49.75,63+Math.floor(i/4)*14,49.75,14,r[0],r[1]));
  table(8,91,W-16,85,[28,20,91,30,30],['Marks and Numbers','Pieces','Description','Weight','Vol / Chargeable Weight'],['shipment.reference','cargo.total_pieces','cargo.description','cargo.gross_weight','cargo.chargeable_weight']);
  field(8,180,W-16,28,'Special Instructions','delivery.instructions');field(8,212,96,30,'Return To','company.address');field(104,212,103,30,'Received Signature / Date','execution.authorized_agent');
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
   const design=kind==='awb'?awbStarter():systemDocDesign(id,name,orientation,kind);
   design.name=name;
   const existing=a.find(t=>t.id===id);
   if(existing){
     // Built-in system templates are code-owned. Refresh their geometry when NODARA ships a new base version.
     existing.name=name; existing.category=category; existing.placements=placements; existing.design=design;
     existing.status='published'; existing.builtin=true; existing.systemRevision='20260928.3';
     existing.updatedAt=now; existing.publishedAt=now; existing.source='Magaya reference template supplied 2026-09-28';
   }else{
     a.push({id,name,status:'published',version:1,category,placements,createdAt:now,updatedAt:now,publishedAt:now,design,builtin:true,systemRevision:'20260928.3',source:'Magaya reference template supplied 2026-09-28'});
   }
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