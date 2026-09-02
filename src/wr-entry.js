import { createWRObjectEditor } from './wr-object-editor.js?v=20260901-2048';

const main=document.getElementById('main');
const editor=createWRObjectEditor({main});
window.nodaraReceive=()=>editor.start();

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-go="receive"]');
  if(!btn)return;
  e.preventDefault();e.stopImmediatePropagation();editor.start();
},true);
