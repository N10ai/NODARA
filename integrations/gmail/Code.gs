// NODARA Gmail bridge. Configure from Operations Inbox > Gmail connection.
const NODARA_CONFIG = __NODARA_CONFIG__;

function nodaraGetMessage(messageId) {
  const response=UrlFetchApp.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(messageId)+'?format=full',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw new Error('Gmail message fetch failed ('+response.getResponseCode()+').');
  return JSON.parse(response.getContentText());
}

function nodaraDecodeBody(data) {
  // Normalize Gmail's base64url alphabet and restore omitted padding.
  let encoded=String(data||'').replace(/\s/g,'').replace(/-/g,'+').replace(/_/g,'/');
  encoded=encoded.replace(/=+$/,'');
  encoded+='='.repeat((4-encoded.length%4)%4);
  try{return Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');}catch{return '';}
}

function setupNodara() {
  const email=Gmail.Users.getProfile('me').emailAddress;
  if(email.toLowerCase()!==NODARA_CONFIG.email.toLowerCase())throw new Error('Authorize this script with '+NODARA_CONFIG.email);
  nodaraReplyTick();
  syncNodara();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncNodara').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncNodara').timeBased().everyMinutes(5).create();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='nodaraReplyTick').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('nodaraReplyTick').timeBased().everyMinutes(1).create();
  console.log('NODARA ready. Email capture every five minutes; replies checked every minute.');
}
function stopNodara() {
  ScriptApp.getProjectTriggers().filter(t=>['syncNodara','nodaraReplyTick'].includes(t.getHandlerFunction())).forEach(t=>ScriptApp.deleteTrigger(t));
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
        const m=nodaraGetMessage(ref.id),headers=m.payload.headers||[];
        const header=name=>(headers.find(h=>h.name.toLowerCase()===name.toLowerCase())||{}).value||'';
        const parts=[];function walk(p){parts.push(p);(p.parts||[]).forEach(walk)}walk(m.payload);
        let plain=parts.filter(p=>p.mimeType==='text/plain'&&p.body&&p.body.data).map(p=>nodaraDecodeBody(p.body.data)).join('\n');
        if(!plain){const html=parts.filter(p=>p.mimeType==='text/html'&&p.body&&p.body.data).map(p=>nodaraDecodeBody(p.body.data)).join('\n');plain=html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<br\s*\/?>|<\/p>|<\/div>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
        const truncated=plain.length>140000;
        return {message_id:m.id,thread_id:m.threadId,subject:header('Subject'),sender:header('From'),received_at:new Date(Number(m.internalDate)).toISOString(),body:plain.slice(0,140000)||m.snippet||'No text body.',metadata:{body_truncated:truncated,to:header('To'),reply_to:header('Reply-To'),attachments:parts.filter(p=>p.filename).map(p=>({name:p.filename,mime_type:p.mimeType,size:p.body&&p.body.size||0}))}};
      });
      const response=UrlFetchApp.fetch(NODARA_CONFIG.endpoint,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+NODARA_CONFIG.token},payload:JSON.stringify({email:profile.emailAddress,messages}),muteHttpExceptions:true});
      if(response.getResponseCode()!==200)throw new Error('NODARA import failed ('+response.getResponseCode()+'). The current batch will be retried.');
      if(page.nextPageToken){state.pageToken=page.nextPageToken;properties.setProperty('NODARA_SYNC_STATE',JSON.stringify(state));}
      else {state={after:state.before-300,before:Math.floor(Date.now()/1000),pageToken:null};properties.setProperty('NODARA_SYNC_STATE',JSON.stringify(state));return;}
    }while(Date.now()-start<240000);
  }finally{lock.releaseLock();}
}

// Reply worker: send only a reviewed NODARA job, once. No automatic resend.
function nodaraBridge(action, data) {
  const response=UrlFetchApp.fetch(NODARA_CONFIG.endpoint,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+NODARA_CONFIG.token},payload:JSON.stringify({email:NODARA_CONFIG.email,action,data:data||{}}),muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw new Error('NODARA reply bridge unavailable ('+response.getResponseCode()+').');
  return JSON.parse(response.getContentText());
}
function nodaraReplyRecipient(value) {
  const addresses=String(value||'').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[];
  if(addresses.length!==1)throw new Error('Cannot verify one reply recipient. Use Gmail.');
  return addresses[0].toLowerCase();
}
function nodaraReplyAddresses(values) {
  if(!Array.isArray(values)||values.length>20)throw new Error('Invalid recipient list.');
  return values.map(value=>{if(typeof value!=='string'||value.length>254||!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value))throw new Error('Invalid recipient address.');return value.toLowerCase();});
}
function nodaraBuildReply(job, profile, source) {
  const header=name=>((source.payload.headers||[]).find(h=>h.name.toLowerCase()===name.toLowerCase())||{}).value||'';
  if(source.id!==job.source_message_id||source.threadId!==job.thread_id)throw new Error('Conversation identity did not match.');
  let tos,ccs;
  if(Array.isArray(job.to_addresses)) {
    tos=nodaraReplyAddresses(job.to_addresses);ccs=nodaraReplyAddresses(job.cc_addresses||[]);
    if(!tos.length||tos.length+ccs.length>20)throw new Error('Invalid recipient count.');
    if(tos.some(x=>ccs.includes(x)))throw new Error('Duplicate To and CC recipient.');
  } else {
    const recipient=nodaraReplyRecipient(header('Reply-To')||header('From'));
    if(recipient!==job.to||recipient===profile.emailAddress.toLowerCase())throw new Error('Reply recipient changed. Refresh the conversation or use Gmail.');
    tos=[recipient];ccs=[];
  }
  if(!job.body||job.body.length>20000)throw new Error('Invalid reply body.');
  const originalId=header('Message-ID').trim();
  if(!/^<[^<>\s]+>$/.test(originalId))throw new Error('Original message has no valid Message-ID. Use Gmail to reply.');
  const references=(header('References').match(/<[^<>\s]+>/g)||[]).concat(originalId).slice(-30).join(' ');
  const subject=header('Subject').replace(/[\r\n]/g,' ').trim();
  const encodedSubject='=?UTF-8?B?'+Utilities.base64Encode(subject,Utilities.Charset.UTF_8)+'?=';
  const content=Utilities.base64Encode(job.body,Utilities.Charset.UTF_8).match(/.{1,76}/g).join('\r\n');
  const mime=['From: '+profile.emailAddress,'To: '+tos.join(', '),...(ccs.length?['Cc: '+ccs.join(', ')]:[]),'Subject: '+encodedSubject,'In-Reply-To: '+originalId,'References: '+references,'Message-ID: <nodara-'+job.id+'@nodara.invalid>','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+content].join('\r\n');
  return {raw:Utilities.base64EncodeWebSafe(mime,Utilities.Charset.UTF_8),threadId:source.threadId};
}
function nodaraReplyTick() {
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try {
    const profile=Gmail.Users.getProfile('me');
    if(profile.emailAddress.toLowerCase()!==NODARA_CONFIG.email.toLowerCase())throw new Error('Wrong Gmail account.');
    const props=PropertiesService.getScriptProperties();
    // A failed acknowledgement is replayed; the Gmail send itself is never replayed.
    const saved=props.getProperties();
    Object.keys(saved).filter(k=>k.indexOf('NODARA_REPLY_')===0).forEach(key=>{
      const result=JSON.parse(saved[key]);
      if(!result.acknowledged){
        if(result.status==='SENDING') {result.status='UNKNOWN';result.error='Sending was interrupted. Check Gmail Sent before sending again.';}
        nodaraBridge('reply_result',result);result.acknowledged=true;props.setProperty(key,JSON.stringify(result));
      } else if(Date.now()-result.saved_at>7*86400000)props.deleteProperty(key);
    });
    const job=nodaraBridge('poll_replies',{recipient_version:2}).job;if(!job)return;
    const key='NODARA_REPLY_'+job.id;if(props.getProperty(key))return;
    let result={id:job.id,status:'SENDING',saved_at:Date.now(),acknowledged:false},sending=false;
    try {
      const source=nodaraGetMessage(job.source_message_id);
      const message=nodaraBuildReply(job,profile,source);
      props.setProperty(key,JSON.stringify(result));sending=true;
      const sent=Gmail.Users.Messages.send(message,'me');
      if(!sent.id||sent.threadId!==job.thread_id)throw new Error('Gmail did not confirm the original reply thread.');
      result.status='SENT';result.message_id=sent.id;
    }catch(error){result.status=sending?'UNKNOWN':'FAILED';result.error=sending?'Could not confirm sending. Check Gmail Sent before sending again.':String(error.message||error).slice(0,250);}
    props.setProperty(key,JSON.stringify(result));
    nodaraBridge('reply_result',result);result.acknowledged=true;props.setProperty(key,JSON.stringify(result));
  }finally{lock.releaseLock();}
}
