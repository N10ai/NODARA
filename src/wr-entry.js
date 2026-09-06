import './operations-wr-link.js?v=20260904-0315';
import './wr-fast-guidance.js?v=20260906-0128';
import './bulk-record-delete.js?v=20260906-0301';
import './transaction-notes.js?v=20260906-0310';
import './service-contract-clarity.js?v=20260906-2336';
import './wr-completion-actions.js?v=20260906-2355';
import './wr-smart-billing-v2.js?v=20260906-0050';
import './wr-saved-guidance-v2.js?v=20260906-0050';
import './wr-canonical-action-events.js?v=20260906-0050';
import './wr-cargo-table-view.js?v=20260906-0234';
import './wr-cargo-new-draft-reset.js?v=20260906-0234';
import './wr-part-master-link.js?v=20260906-0301';
import { createWRObjectEditorV2 } from './wr-object-editor-v2.js?v=20260906-0234';
const main=document.getElementById('main');
const editor=createWRObjectEditorV2({main});
async function openEditor(){window.nodaraSetActive?.('wr');await editor.start();window.dispatchEvent(new CustomEvent('nodara:new-wr-draft'))}
window.nodaraReceive=openEditor;
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-go="receive"]');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();openEditor()},true);
