import { openEntitiesModule } from './entities-module.js?v=20260901-2315';
document.addEventListener('click',e=>{const hit=e.target.closest?.('[data-route="entities"],[data-subroute="entities"]');if(!hit)return;e.preventDefault();e.stopImmediatePropagation();openEntitiesModule()},true);
window.nodaraEntities=openEntitiesModule;
