import './wr-media-components-v9.js?v=20260909-v10';
import './wr-document-scanner-v9b.js?v=20260909-v10';
import './wr-signature-component-v9.js?v=20260909-v10';
import './wr-os-guard-v10.js?v=20260909-v10b';
import './wr-os-guidance-v10.js?v=20260909-v10b';
import './settings-system.js?v=20260908-settings1';
import { openNewWarehouseReceipt, openWarehouseReceipt } from './wr-receiving-os-v10.js?v=20260909-v10';

async function openEditor(){
  window.nodaraSetActive?.('wr');
  await openNewWarehouseReceipt();
}
window.nodaraReceive=openEditor;
window.nodaraNewReceipt=openEditor;
window.nodaraOpenNewWR=openEditor;
window.nodaraOpenCanonicalWR=openWarehouseReceipt;

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-go="receive"],[data-new-wr],[data-action="new-wr"]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openEditor();
},true);
