export const PACKAGE_TYPES=['PALLET','CRATE','SKID','CARTON','BOX','BAG','SACK','ENVELOPE','DRUM','BARREL','BUNDLE','COIL','ROLL','TOTE','BIN','LOOSE PIECE','CONTAINER','OTHER'];
function packageExtras(type){const x=window.__nodaraCargoDraftDetails?.packages?.[String(type||'').toUpperCase()];return x?JSON.parse(JSON.stringify(x)):{} }
function itemExtras(){const d=window.__nodaraCargoDraftDetails;if(!d?.items?.length)return{};const i=d.itemCursor||0;d.itemCursor=i+1;return JSON.parse(JSON.stringify(d.items[i%d.items.length]||{}))}
export function makePackage(type='PALLET',quantity=1,children=[]){return{type,quantity:Number(quantity||1),...packageExtras(type),children}}
export function makeItem({sku='',part_number='',description='',quantity=1,uom='EA'}={}){const extra=itemExtras();return{type:'ITEM',sku,part_number,description,quantity:Number(quantity||0),uom,...extra}}
export function cloneNode(node){return JSON.parse(JSON.stringify(node))}
export function repeatPackage(type,count,childTemplate=[]){return Array.from({length:Number(count||0)},()=>makePackage(type,1,childTemplate.map(cloneNode)))}
export function summarizeTree(nodes){const s={packages:0,items:{}};const walk=n=>{if(n.type==='ITEM'||n.sku||n.part_number){const k=n.sku||n.part_number||n.description||'ITEM';s.items[k]=(s.items[k]||0)+Number(n.quantity||0)}else s.packages+=Number(n.quantity||1);(n.children||[]).forEach(walk)};nodes.forEach(walk);return s}
