import './wr-mobile-operations-v3.js?v=20260908-visit1';
import './wr-workspace-polish-v4.js?v=20260908-v4a';
import './wr-create-experience-v6.js?v=20260909-v6a';
import './wr-execution-tools-v6.js?v=20260909-v6a';
import './wr-unified-receiving-v8.js?v=20260909-v8a';
import './wr-part-link-v8.js?v=20260909-v8a';
import './wr-cargo-nav-v8.js?v=20260909-v8a';
import './wr-capture-bridge-v8.js?v=20260909-v8a';
import './wr-media-components-v9.js?v=20260909-v9a';
import './wr-signature-component-v9.js?v=20260909-v9a';
import './wr-real-components-bridge-v9.js?v=20260909-v9a';
import './settings-system.js?v=20260908-settings1';
import { openWRCreateEditor } from './wr-create-editor.js?v=20260909-flow1';

async function openCreatedReceipt(result){
 const id=result?.warehouse_receipt_id||result?.id;
 const mod=await import('./wr-records-unified.js?v=20260909-v8a');
 if(id){
   try{sessionStorage.setItem('nodara_open_wr_execution',String(id))}catch{}
   return mod.warehouseReceiptOpen(id);
 }
 return mod.warehouseReceiptList();
}
async function openEditor(){
 window.nodaraSetActive?.('wr');
 window.__nodaraCargoDraftDetails=null;
 window.__nodaraWRDraftFlags=[];
 await openWRCreateEditor({onDone:openCreatedReceipt,onCancel:async()=>{const mod=await import('./wr-records-unified.js?v=20260909-v8a');return mod.warehouseReceiptList();}});
}
window.nodaraReceive=openEditor;
window.nodaraNewReceipt=openEditor;
window.nodaraOpenNewWR=openEditor;
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-go="receive"],[data-new-wr],[data-action="new-wr"]');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();openEditor()},true);