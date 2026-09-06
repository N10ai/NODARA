import { supabase } from './supabase-client.js';

/**
 * Read-only compatibility adapter. New business rules must not be written back
 * to entities.sop. This module exists only to preview/migrate historical config.
 */
export async function loadLegacyCustomerConfiguration(customerId){
  const[entityRes,ratesRes,templatesRes]=await Promise.all([
    supabase.from('entities').select('id,name,code,email,phone,sop').eq('id',customerId).single(),
    supabase.from('customer_rate_agreements').select('*,service_catalog(id,code,name,domain)').eq('customer_id',customerId).eq('active',true),
    supabase.from('customer_service_templates').select('*,rate_templates(id,code,name,domain)').eq('customer_id',customerId).eq('active',true)
  ]);
  for(const x of[entityRes,ratesRes,templatesRes])if(x.error)throw x.error;
  return{entity:entityRes.data,rates:ratesRes.data||[],templates:templatesRes.data||[]};
}

export function buildLegacyMigrationPreview({entity,rates=[],templates=[]}){
  const sop=entity?.sop||{},receiving=sop.receiving||{},billing=sop.billing||{},shipments=sop.shipments||{};
  const contacts=Array.isArray(sop.contacts)?sop.contacts:[];
  const addresses=Array.isArray(sop.addresses)?sop.addresses:[];
  const requirements=[];
  if(receiving.require_weight)requirements.push(req('REQUIRE_WEIGHT','MEASUREMENT','Capture weight',{action_type:'CAPTURE_MEASUREMENT',completion_rule:{type:'WEIGHT_PRESENT'}}));
  if(receiving.require_dimensions)requirements.push(req('REQUIRE_DIMENSIONS','MEASUREMENT','Capture dimensions',{action_type:'CAPTURE_MEASUREMENT',completion_rule:{type:'DIMENSIONS_PRESENT'}}));
  if(shipments.require_po)requirements.push(req('REQUIRE_PO','REFERENCE','PO / reference required',{action_type:'VERIFY_DATA',completion_rule:{type:'REFERENCE_EXISTS',reference_type:'PO'}}));
  for(const doc of receiving.required_documents||[])requirements.push(req(`DOC_${doc}`,'DOCUMENT',`${String(doc).replaceAll('_',' ')} required`,{action_type:'UPLOAD_DOCUMENT',completion_rule:{type:'DOCUMENT_EXISTS',document_type:doc}}));
  const evidence=receiving.evidence||[];
  for(const [i,e] of evidence.entries())requirements.push({
    requirement_code:`EVIDENCE_${e.type||'PHOTO'}_${i+1}`,
    requirement_type:'EVIDENCE',label:`${String(e.type||'Photo').replaceAll('_',' ')} evidence`,scope:String(e.scope||'top_level_piece').toUpperCase(),
    blocking:true,repeat_mode:scopeRepeat(e.scope),conditions:legacyWhen(e.when),
    configuration:{action_type:'CAPTURE_EVIDENCE',completion_rule:{type:'EVIDENCE_COUNT',evidence_type:e.type||'GENERAL_PHOTO',minimum:Number(e.min||1)}}
  });
  if(!evidence.length&&Number(receiving.photo_sides||0)>0)requirements.push({
    requirement_code:'RECEIVING_PHOTOS',requirement_type:'EVIDENCE',label:'Receiving photos',scope:'TRANSACTION',blocking:true,repeat_mode:'ONCE',conditions:{},
    configuration:{action_type:'CAPTURE_EVIDENCE',completion_rule:{type:'EVIDENCE_COUNT',minimum:Number(receiving.photo_sides)}}
  });
  const billingRules=(rates||[]).map((r,i)=>({
    rule_code:`LEGACY_RATE_${r.service_catalog?.code||i+1}`,service_id:r.service_id,basis:r.unit,unit:r.unit,rate:Number(r.sell_rate||0),minimum_charge:r.minimum_charge==null?null:Number(r.minimum_charge),currency:r.currency||'USD',included:false,trigger_event:r.metadata?.auto_charge_event||null,conditions:{},provenance:{source:'CUSTOMER_RATE_AGREEMENT',source_id:r.id}
  }));
  const communicationRules=[];
  const emails=contacts.filter(x=>x.email&&((x.roles||[]).includes('operations')||(x.roles||[]).includes('primary'))).map(x=>x.email);
  if(emails.length)communicationRules.push({event_code:'WR_COMPLETED',channel:'EMAIL',recipient_role:'operations',recipients:emails,automatic:false,blocking:false});
  return{
    customer:{id:entity?.id,name:entity?.name},
    canonicalContacts:contacts.map(c=>({name:c.name||'Contact',title:c.title||null,email:c.email||null,phone:c.phone||null,roles:c.roles||[],is_primary:(c.roles||[]).includes('primary')})),
    canonicalAddresses:addresses.map(a=>({address_type:String(a.type||'office').toUpperCase(),name:a.name||null,line1:a.line1||'',metadata:{legacy:a}})),
    requirements,billingRules,communicationRules,
    unresolved:{legacyAutoCharges:billing.auto_charges||[],legacyServices:sop.services||[],legacyNotes:sop.notes||null,assignedTemplates:templates}
  };
}

function req(code,type,label,configuration){return{requirement_code:code,requirement_type:type,label,scope:'TRANSACTION',blocking:true,repeat_mode:'ONCE',conditions:{},configuration}}
function scopeRepeat(scope){const s=String(scope||'').toLowerCase();if(s==='top_level_piece'||s==='each_package')return'PER_HANDLING_UNIT';if(s==='each_item')return'PER_ITEM';if(s==='each_serial')return'PER_SERIAL';return'ONCE'}
function legacyWhen(when){const w=String(when||'always').toLowerCase();if(w==='if_damaged')return{'exceptions.damaged':true};if(w==='if_dg')return{'context.dangerous_goods':true};if(w==='if_ftz')return{'context.ftz':true};if(w==='if_bonded')return{'context.bonded':true};if(w==='if_serialized')return{'cargo.serialized':true};return{}}
