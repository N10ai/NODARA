// NODARA Gmail bridge. Configure from Operations Inbox > Gmail connection.
const NODARA_CONFIG = __NODARA_CONFIG__;

function setupNodara() {
  const email=Gmail.Users.getProfile('me').emailAddress;
  if(email.toLowerCase()!==NODARA_CONFIG.email.toLowerCase())throw new Error('Authorize this script with '+NODARA_CONFIG.email);
  syncNodara();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncNodara').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncNodara').timeBased().everyMinutes(5).create();
}
function stopNodara() {
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncNodara').forEach(t=>ScriptApp.deleteTrigger(t));
}
function syncNodara() {
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try {
    const properties=PropertiesService.getScriptProperties();
    const profile=Gmail.Users.getProfile('me');
    if(profile.emailAddress.toLowerCase()!==NODARA_CONFIG.email.toLowerCase())throw new Error('Wrong Gmail account');
    let state=JSON.parse(properties.getProperty('NODARA_SYNC_STATE')||'null');
    if(!state)state={after:Math.floor(Date.now()/1000)-NODARA_CONFIG.initialDays*86400,before:Math.floor(Date.now()/1000),pageToken:null};
    const start=Date.now();
    do {
      const options={q:'('+NODARA_CONFIG.query+') after:'+state.after+' before:'+state.before,maxResults:25};
      if(state.pageToken)options.pageToken=state.pageToken;
      const page=Gmail.Users.Messages.list('me',options);
      const messages=(page.messages||[]).map(ref=>{
        const m=Gmail.Users.Messages.get('me',ref.id,{format:'full'}),headers=m.payload.headers||[];
        const header=name=>(headers.find(h=>h.name.toLowerCase()===name.toLowerCase())||{}).value||'';
        const parts=[];function walk(p){parts.push(p);(p.parts||[]).forEach(walk)}walk(m.payload);
        let plain=parts.filter(p=>p.mimeType==='text/plain'&&p.body&&p.body.data).map(p=>Utilities.newBlob(Utilities.base64DecodeWebSafe(p.body.data)).getDataAsString('UTF-8')).join('\n');
        if(!plain){const html=parts.filter(p=>p.mimeType==='text/html'&&p.body&&p.body.data).map(p=>Utilities.newBlob(Utilities.base64DecodeWebSafe(p.body.data)).getDataAsString('UTF-8')).join('\n');plain=html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<br\s*\/?>|<\/p>|<\/div>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
        const truncated=plain.length>140000;
        return {message_id:m.id,thread_id:m.threadId,subject:header('Subject'),sender:header('From'),received_at:new Date(Number(m.internalDate)).toISOString(),body:plain.slice(0,140000)||m.snippet||'No text body.',metadata:{body_truncated:truncated,to:header('To'),attachments:parts.filter(p=>p.filename).map(p=>({name:p.filename,mime_type:p.mimeType,size:p.body&&p.body.size||0}))}};
      });
      const response=UrlFetchApp.fetch(NODARA_CONFIG.endpoint,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+NODARA_CONFIG.token},payload:JSON.stringify({email:profile.emailAddress,messages}),muteHttpExceptions:true});
      if(response.getResponseCode()!==200)throw new Error('NODARA import failed ('+response.getResponseCode()+'). The current batch will be retried.');
      if(page.nextPageToken){state.pageToken=page.nextPageToken;properties.setProperty('NODARA_SYNC_STATE',JSON.stringify(state));}
      else {state={after:state.before-300,before:Math.floor(Date.now()/1000),pageToken:null};properties.setProperty('NODARA_SYNC_STATE',JSON.stringify(state));return;}
    }while(Date.now()-start<240000);
  }finally{lock.releaseLock();}
}
