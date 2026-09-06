import './operations-wr-link.js?v=20260904-0315';
import './wr-receiving-wizard-v2.js?v=20260906-2335';
import './service-contract-clarity.js?v=20260906-2336';
import './wr-completion-actions.js?v=20260906-2355';
import './wr-smart-billing-v2.js?v=20260906-0025';
import './wr-saved-guidance-v2.js?v=20260906-0015';
import { createWRObjectEditorV2 } from './wr-object-editor-v2.js?v=20260901-2315';
const main=document.getElementById('main');
const editor=createWRObjectEditorV2({main});
function openEditor(){window.nodaraSetActive?.('wr');editor.start()}
window.nodaraReceive=openEditor;
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-go="receive"]');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();openEditor()},true);
