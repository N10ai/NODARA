import { createWRObjectEditorV2 } from './wr-object-editor-v2.js?v=20260901-2110';
const main=document.getElementById('main');
const editor=createWRObjectEditorV2({main});
window.nodaraReceive=()=>editor.start();
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-go="receive"]');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();editor.start()},true);
