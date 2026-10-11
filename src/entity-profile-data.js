export function readEntityMasterData(){
 const main=document.getElementById('main'),val=(r,s)=>r.querySelector(s)?.value.trim()||null;
 const contacts=[...main.querySelectorAll('[data-cc-row]')].map(r=>({id:r.dataset.id||null,name:val(r,'[data-cc-name]'),title:val(r,'[data-cc-title]'),email:val(r,'[data-cc-email]'),phone:val(r,'[data-cc-phone]'),roles:(val(r,'[data-cc-roles]')||'').split(',').map(x=>x.trim()).filter(Boolean),is_primary:r.querySelector('[data-cc-primary]').checked})).filter(r=>r.name||r.email||r.phone);
 const addresses=[...main.querySelectorAll('[data-ca-row]')].map(r=>({id:r.dataset.id||null,address_type:val(r,'[data-ca-type]'),name:val(r,'[data-ca-name]'),line1:val(r,'[data-ca-line1]'),city:val(r,'[data-ca-city]'),state_region:val(r,'[data-ca-state]'),postal_code:val(r,'[data-ca-postal]'),country_code:val(r,'[data-ca-country]')?.toUpperCase(),is_primary:r.querySelector('[data-ca-primary]').checked})).filter(r=>r.name||r.line1);
 if(contacts.length&&!contacts.some(x=>x.is_primary))contacts[0].is_primary=true;
 if(addresses.length&&!addresses.some(x=>x.is_primary))addresses[0].is_primary=true;
 const legal=Object.fromEntries([...main.querySelectorAll('[data-legal-field]')].map(x=>[x.dataset.legalField,x.value.trim()||null]));
 return{contacts,addresses,legal,canonical:!!main.querySelector('[data-cc-list]')};
}
