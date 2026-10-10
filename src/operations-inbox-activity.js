const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stateNames={NEW:'Up next',WORKING:'In progress',WAITING:'Waiting',READY_TO_BILL:'Ready to bill',COMPLETED:'Completed',CANCELLED:'Cancelled'};
const dayLabel=value=>{const d=new Date(value),today=new Date(),yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);return d.toDateString()===today.toDateString()?'Today':d.toDateString()===yesterday.toDateString()?'Yesterday':d.toLocaleDateString([],{month:'short',day:'numeric',year:d.getFullYear()!==today.getFullYear()?'numeric':undefined});};
export function taskActivityItems(notes,events,team=[]){
 const author=id=>team.find(m=>m.user_id===id)?.name||'Team member';
 const updates=notes.map(n=>({id:'note:'+n.id,kind:'updates',body:n.body,author:author(n.created_by),date:n.created_at}));
 const changes=events.flatMap(e=>{const before=e.changes?.before||{},after=e.changes?.after||{};let body='';
  if(e.event==='INSERT')body='Created this task';
  else if(!before.deleted_at&&after.deleted_at)body='Moved this task to Trash';
  else if(before.deleted_at&&!after.deleted_at)body='Restored this task';
  else{const labels={title:'title',description:'details',request_type:'service',customer_id:'customer',customer_name:'customer',assignee_user_id:'assignment',owner_name:'assignment',priority:'priority',due_at:'due date',follow_up_at:'reminder',waiting_on:'waiting on',next_action:'current task',billing_requirement:'billing',billing_status:'billing',invoice_reference:'invoice reference'};const fields=[...new Set(Object.keys(labels).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])).map(k=>labels[k]))];if(before.status!==after.status){body=`Moved to ${stateNames[after.status]||after.status}`;if(fields.length)body+=' · updated '+fields.join(', ');}else if(fields.length)body='Updated '+fields.join(', ');}
  return body?[{id:'change:'+e.id,kind:'changes',body,author:author(e.actor_id||after.created_by),date:e.created_at}]:[];
 });
 return [...updates,...changes].sort((a,b)=>new Date(b.date)-new Date(a.date)||a.id.localeCompare(b.id));
}
export function taskActivityMarkup(items,filter='all'){
 const visible=items.filter(item=>filter==='all'||item.kind===filter);let day='';
 return visible.map(item=>{const label=dayLabel(item.date),heading=label!==day?`<h4 class="oi-activity-day">${esc(label)}</h4>`:'';day=label;const initials=item.author.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();return `${heading}<article class="oi-activity-entry ${item.kind==='changes'?'oi-activity-change':''}"><span class="oi-activity-avatar" aria-hidden="true">${esc(initials)}</span><div class="oi-activity-content"><div class="oi-activity-byline"><b title="${esc(item.author)}">${esc(item.author)}</b><time datetime="${esc(item.date)}" title="${esc(new Date(item.date).toLocaleString())}">${esc(new Date(item.date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))}</time></div><p>${esc(item.body)}</p>${item.kind==='updates'?'<small>Update</small>':''}</div></article>`;}).join('')||`<div class="oi-activity-empty"><b>${filter==='updates'?'No updates yet':filter==='changes'?'No changes yet':'No activity yet'}</b><p>Add a note when something changes or needs attention.</p></div>`;
}
