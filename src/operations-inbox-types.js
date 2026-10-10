export const requestTypes={PICKUP:'Pickup',DELIVERY:'Delivery',TRANSFER:'Transfer',DRAYAGE:'Drayage',SHIPMENT_AIR:'Air shipment',SHIPMENT_OCEAN:'Ocean shipment',SHIPMENT_GROUND:'Ground shipment',WAREHOUSE_RECEIVING:'Warehouse receiving',WAREHOUSE_RELEASE:'Warehouse release',PICK_PACK:'Pick & pack',LABELING:'Labeling',REPACKING:'Repacking',PALLETIZING:'Palletizing',CROSS_DOCK:'Cross dock',CARGO_PHOTOS:'Cargo photos',CARGO_MEASUREMENTS:'Weights & dimensions',CONTAINER_LOADING:'Container loading',CONTAINER_UNLOADING:'Container unloading',STORAGE:'Storage request',CYCLE_COUNT:'Cycle count',WAREHOUSE_OTHER:'Other warehouse service',DOCUMENTATION:'Documentation',INVENTORY_CHECK:'Inventory check',COMPLAINT:'Complaint',COMPLIANCE:'Compliance question',OTHER:'General task'};

// UI categories group the existing saved service types without changing record identity.
export const requestCategories={TRANSPORT:'Transport',SHIPMENTS:'Shipments',WAREHOUSE:'Warehouse',DOCUMENTS:'Documents',COMPLIANCE:'Compliance',SUPPORT:'Customer support',GENERAL:'General'};
export function requestCategory(type){
 if(['PICKUP','DELIVERY','TRANSFER','DRAYAGE'].includes(type))return 'TRANSPORT';
 if(type?.startsWith('SHIPMENT_'))return 'SHIPMENTS';
 if(type?.startsWith('WAREHOUSE_')||['PICK_PACK','LABELING','REPACKING','PALLETIZING','CROSS_DOCK','CARGO_PHOTOS','CARGO_MEASUREMENTS','CONTAINER_LOADING','CONTAINER_UNLOADING','STORAGE','CYCLE_COUNT','INVENTORY_CHECK'].includes(type))return 'WAREHOUSE';
 if(type==='DOCUMENTATION')return 'DOCUMENTS';if(type==='COMPLIANCE')return 'COMPLIANCE';if(type==='COMPLAINT')return 'SUPPORT';return 'GENERAL';
}
export function requestTypeOptions(selected='OTHER',category=''){
 return Object.entries(requestCategories).filter(([key])=>!category||key===category).map(([key,label])=>`<optgroup label="${label}">${Object.entries(requestTypes).filter(([type])=>requestCategory(type)===key).map(([type,name])=>`<option value="${type}" ${type===selected?'selected':''}>${name}</option>`).join('')}</optgroup>`).join('');
}
