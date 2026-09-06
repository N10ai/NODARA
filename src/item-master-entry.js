import { openItemMasterCore } from './item-master-core-list.js?v=20260906-core2';
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-subroute="settings_items"],[data-open-part-master]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openItemMasterCore()},true);
window.nodaraItemMaster=openItemMasterCore;
