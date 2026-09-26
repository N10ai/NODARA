import { supabase } from './supabase-client.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export async function searchTransportLocations(query,{mode='AIR',limit=8}={}){
 const q=String(query||'').trim();if(!q)return[];const preferred=String(mode).toUpperCase()==='OCEAN'?'SEAPORT':'AIRPORT',safe=q.replace(/[,%()]/g,' ').trim();
 const {data,error}=await supabase.from('transport_locations').select('id,location_type,name,city,subdivision,country_code,iata_code,icao_code,unlocode,aliases,priority').or(`iata_code.ilike.%${safe}%,icao_code.ilike.%${safe}%,unlocode.ilike.%${safe}%,name.ilike.%${safe}%,city.ilike.%${safe}%,search_text.ilike.%${safe}%`).order('priority',{ascending:false}).limit(30);
 if(error)throw error;return(data||[]).sort((a,b)=>(b.location_type===preferred)-(a.location_type===preferred)||Number(b.priority||0)-Number(a.priority||0)).slice(0,limit)
}
export function transportLocationCode(x,mode='AIR'){return String(mode).toUpperCase()==='OCEAN'?(x.unlocode||x.iata_code||''):(x.iata_code||x.unlocode||x.icao_code||'')}
export function mountTransportLocationResolver(host,{label='Location',mode='AIR',value='',required=false,onSelect,onClear}={}){
 let selected=null,timer=null;host.innerHTML=`<label class="tlr"><span>${esc(label)}${required?' <em>REQUIRED</em>':''}</span><div class="tlr-input"><input autocomplete="off" value="${esc(value)}" placeholder="${String(mode).toUpperCase()==='OCEAN'?'Type port, city or UN/LOCODE…':'Type MIA, Miami, airport name…'}"><button type="button" data-tlr-clear>×</button></div><div class="tlr-menu" hidden></div></label>`;
 const input=host.querySelector('input'),menu=host.querySelector('.tlr-menu');
 const render=rows=>{menu.innerHTML=rows.length?rows.map(x=>{const code=transportLocationCode(x,mode),meta=[x.city,x.subdivision,x.country_code].filter(Boolean).join(', ');return`<button type="button"><b>${esc(code)}</b><span><strong>${esc(x.name)}</strong><small>${esc(meta)} · ${x.location_type==='AIRPORT'?'Airport':'Seaport'}${x.unlocode?' · '+esc(x.unlocode):''}</small></span></button>`}).join(''):'<div class="tlr-empty">No matching transport location</div>';menu.hidden=false;menu.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{selected=rows[i];input.value=transportLocationCode(selected,mode);menu.hidden=true;onSelect?.(selected)})};
 input.oninput=()=>{selected=null;clearTimeout(timer);timer=setTimeout(async()=>{try{render(await searchTransportLocations(input.value,{mode}))}catch(e){menu.innerHTML=`<div class="tlr-empty">${esc(e.message)}</div>`;menu.hidden=false}},140)};input.onfocus=()=>{if(input.value.trim())input.oninput()};input.onkeydown=e=>{if(e.key==='Escape')menu.hidden=true};
 host.querySelector('[data-tlr-clear]').onclick=()=>{selected=null;input.value='';menu.hidden=true;onClear?.();input.focus()};
 return{getValue:()=>selected?transportLocationCode(selected,mode):input.value.trim(),getLocation:()=>selected}
}
