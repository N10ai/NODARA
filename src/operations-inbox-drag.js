// Pointer-driven grips avoid the browser's long-press delay on touch devices.
export function bindBoardDrag(host,{onMove,onOpen}){
 const board=host.querySelector('.oi-board');if(!board)return ()=>{};
 const events=new AbortController();let drag=null,frame=null,ignoreClickUntil=0;
 const clearTarget=()=>host.querySelectorAll('.oi-drop-target').forEach(x=>x.classList.remove('oi-drop-target'));
 function targetAt(x,y){const column=document.elementFromPoint(x,y)?.closest('[data-stage]');return column&&board.contains(column)?column:null;}
 function paint(){if(!drag?.started)return;const {ghost,x,y,offsetX,offsetY}=drag;ghost.style.transform=`translate3d(${x-offsetX}px,${y-offsetY}px,0)`;clearTarget();drag.target=targetAt(x,y);drag.target?.classList.add('oi-drop-target');}
 function tick(){if(!drag?.started)return;if(!board.isConnected){cleanup();return;}const rect=board.getBoundingClientRect(),edge=48;let dx=0;
  if(drag.y>=rect.top&&drag.y<=rect.bottom){if(drag.x>rect.right-edge)dx=Math.min(14,(drag.x-rect.right+edge)/3);else if(drag.x<rect.left+edge)dx=-Math.min(14,(rect.left+edge-drag.x)/3);}
  if(dx)board.scrollLeft+=dx;
  if(drag.y<65)window.scrollBy(0,-8);else if(drag.y>innerHeight-65)window.scrollBy(0,8);
  paint();frame=requestAnimationFrame(tick);
 }
 function cleanup(){if(frame)cancelAnimationFrame(frame);frame=null;clearTarget();board.classList.remove('oi-board-drag-active');if(drag){drag.ghost?.remove();drag.card.classList.remove('oi-dragging');try{drag.handle.releasePointerCapture(drag.pointerId);}catch{}}drag=null;}
 function begin(){drag.started=true;board.classList.add('oi-board-drag-active');ignoreClickUntil=Date.now()+500;const rect=drag.card.getBoundingClientRect();drag.offsetX=drag.startX-rect.left;drag.offsetY=drag.startY-rect.top;const ghost=drag.card.cloneNode(true);ghost.removeAttribute('draggable');ghost.removeAttribute('data-drag-request');ghost.setAttribute('aria-hidden','true');ghost.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));ghost.classList.add('oi-drag-ghost');ghost.style.width=rect.width+'px';document.body.append(ghost);drag.ghost=ghost;drag.card.classList.add('oi-dragging');paint();frame=requestAnimationFrame(tick);}
 host.querySelectorAll('[data-drag-handle]').forEach(handle=>{
  handle.addEventListener('pointerdown',e=>{if(drag||e.button!==0)return;const card=handle.closest('[data-drag-request]');if(!card)return;e.preventDefault();e.stopPropagation();drag={pointerId:e.pointerId,card,handle,id:card.dataset.dragRequest,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,started:false};handle.setPointerCapture(e.pointerId);},{signal:events.signal});
  handle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();},{signal:events.signal});
  handle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen?.(handle.dataset.dragHandle);}if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const column=handle.closest('[data-stage]'),columns=[...board.querySelectorAll('[data-stage]')],next=columns[columns.indexOf(column)+(e.key==='ArrowRight'?1:-1)];if(next)onMove(handle.dataset.dragHandle,next.dataset.stage);}},{signal:events.signal});
 });
 document.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointerId)return;drag.x=e.clientX;drag.y=e.clientY;if(!drag.started&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>=5)begin();if(drag.started){e.preventDefault();paint();}},{signal:events.signal,passive:false});
 document.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointerId)return;drag.x=e.clientX;drag.y=e.clientY;const id=drag.id,target=drag.started?targetAt(drag.x,drag.y):null;if(drag.started){ignoreClickUntil=Date.now()+500;e.preventDefault();}cleanup();if(target)onMove(id,target.dataset.stage);},{signal:events.signal});
 document.addEventListener('pointercancel',cleanup,{signal:events.signal});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();cleanup();}},{signal:events.signal});
 host.addEventListener('click',e=>{if(Date.now()<ignoreClickUntil){e.preventDefault();e.stopPropagation();}},{signal:events.signal,capture:true});
 return ()=>{events.abort();cleanup();};
}
