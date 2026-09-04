import './operations-wr-link.js?v=20260904-0315';
import { createWRObjectEditorV2 } from './wr-object-editor-v2.js?v=20260901-2315';
const main=document.getElementById('main');
const editor=createWRObjectEditorV2({main});
function openEditor(){window.nodaraSetActive?.('wr');editor.start()}
window.nodaraReceive=openEditor;
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-go="receive"]');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();openEditor()},true);
