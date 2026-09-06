import './service-contract-clarity.js?v=20260906-2336';
import { openEntitiesModule } from './entities-module.js?v=20260901-2315';

document.addEventListener('click',e=>{
 const hit=e.target.closest?.('[data-route="entities"],[data-subroute="entities"]');if(!hit)return;e.preventDefault();e.stopImmediatePropagation();openEntitiesModule();
},true);

document.addEventListener('click',e=>{
 const b=e.target.closest?.('.entity-tabs [data-jump]');if(!b||!['identity','contacts','addresses'].includes(b.dataset.jump))return;
 e.preventDefault();e.stopImmediatePropagation();const id=b.dataset.jump,tabs=b.closest('.entity-tabs');tabs?.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
 for(const s of document.querySelectorAll('#identity,#contacts,#addresses,[data-canonical-section]')){if(s.dataset.canonicalSection!=null)s.hidden=true;else s.hidden=s.id!==id}
 document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});
},true);

window.nodaraEntities=openEntitiesModule;
