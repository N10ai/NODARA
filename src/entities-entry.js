import { openEntitiesCore } from './entities-core-list.js?v=20261013-workspace1';

document.addEventListener('click',e=>{const hit=e.target.closest?.('[data-route="entities"],[data-subroute="entities"]');if(!hit)return;e.preventDefault();e.stopImmediatePropagation();openEntitiesCore()},true);
window.nodaraEntities=openEntitiesCore;
