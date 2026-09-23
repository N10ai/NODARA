// NODARA canonical address autocomplete — provider-neutral, defaults to OpenStreetMap Nominatim
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache=new Map();
let timer;
export function bindAddressAutocomplete(input,{onSelect,min=3}={}){
 if(!input)return()=>{};
 const box=document.createElement('div');box.className='address-autocomplete';box.hidden=true;input.parentElement.style.position='relative';input.parentElement.appendChild(box);
 const close=()=>box.hidden=true;
 const search=()=>{clearTimeout(timer);timer=setTimeout(async()=>{const q=input.value.trim();if(q.length<min)return close();let rows=cache.get(q);if(!rows){try{const res=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=us&accept-language=en&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});rows=await res.json();cache.set(q,rows)}catch{return close()}}box.innerHTML=(rows||[]).map((x,i)=>'<button type="button" data-i="'+i+'"><b>'+esc(x.name||x.display_name.split(',')[0])+'</b><span>'+esc(x.display_name)+'</span></button>').join('');box.hidden=!rows?.length;box.querySelectorAll('button').forEach(b=>b.onclick=()=>{const x=rows[Number(b.dataset.i)],a=x.address||{};const value={formatted_address:x.display_name,line1:[a.house_number,a.road||a.pedestrian||a.building].filter(Boolean).join(' ')||x.name||'',line2:'',city:a.city||a.town||a.village||a.hamlet||'',state_region:a.state||'',postal_code:a.postcode||'',country_code:(a.country_code||'').toUpperCase(),latitude:Number(x.lat),longitude:Number(x.lon),geocoding_provider:'OSM_NOMINATIM',geocoding_place_id:String(x.place_id||'')};input.value=value.formatted_address;close();onSelect?.(value)})},260)};
 input.addEventListener('input',search);input.addEventListener('focus',search);document.addEventListener('click',e=>{if(e.target!==input&&!box.contains(e.target))close()});
 return close;
}
