// Code-owned starter definitions. Installed once; customer edits are never refreshed.
const field=(key,label,required=true,type='text')=>({key,label,type,required});
const text=(id,y,value,h=14,size=12)=>({id,type:'text',x:16,y,w:184,h,text:value,fontSize:size,fontFamily:'Arial',fontWeight:'400',textColor:'#17243b',border:0});
function design(key,name,sections,fields){
 const objects=[{...text(key+'-brand',12,'NODARA | CUSTOMER ONBOARDING',7,11),fontWeight:'700'}, {...text(key+'-title',26,name,15,23),fontWeight:'700'}];
 let y=49;
 for(const [heading,body,height=28] of sections){objects.push({...text(key+'-h-'+y,y,heading,8,13),fontWeight:'700'});objects.push(text(key+'-b-'+y,y+10,body,Math.min(height,25)));y+=Math.min(height,25)+15;}
 objects.push(text(key+'-footer',258,'Completed fields and the electronic signature record are attached to this document.',8,10));
 return {name,pagePreset:'LETTER',pageW:215.9,pageH:279.4,pageColor:'#ffffff',pageOrientation:'portrait',zoom:.72,grid:1,snap:true,objects,selected:[],marginTop:12,marginRight:16,marginBottom:12,marginLeft:16,onboardingFields:fields,standardRevision:'20261011.1'};
}
export function standardOnboardingTemplates(w9Background){
 const specs=[
 ['customer-information','Customer Information Form','CUSTOMER_INFORMATION',[
  ['Company identity','Legal name: {{customer.legal_name}}\nDBA / trade name: {{customer.dba_name}}',24],
  ['Company contact','Email: {{customer.email}}\nPhone: {{customer.phone}}\nWebsite: {{customer.website}}',28],
  ['Operations contact','Name: {{contact.name}}\nEmail: {{contact.email}}\nPhone: {{contact.phone}}',28],
  ['Billing address','{{billing.address}}\n{{billing.city}}, {{billing.state}} {{billing.postal}}\n{{billing.country}}',28],
  ['Confirmation','The authorized representative confirms that the company and contact details supplied with this form are accurate.',17]
 ],[field('customer.legal_name','Legal company name'),field('customer.dba_name','DBA / trade name',false),field('customer.email','Company email',true,'email'),field('customer.phone','Company phone'),field('customer.website','Website',false),field('contact.name','Operations contact name'),field('contact.email','Operations contact email',true,'email'),field('contact.phone','Operations contact phone',false),field('billing.address','Billing street address'),field('billing.city','Billing city'),field('billing.state','Billing state / region',false),field('billing.postal','Billing postal code'),field('billing.country','Billing country')]],
 ['billing-instructions','Billing Instructions','BILLING_INSTRUCTIONS',[
  ['Customer','{{customer.legal_name}}',16],
  ['Accounts payable','Contact: {{billing.contact}}\nInvoice email: {{billing.email}}',25],
  ['Invoice routing','Purchase order / required reference: {{billing.reference}}\nDelivery instructions: {{billing.instructions}}',35],
  ['Existing payment terms','Payment terms on the customer profile: {{customer.payment_terms}}\nThis form records invoice routing instructions. It does not grant credit or change an existing payment agreement.',34],
  ['Confirmation','The authorized representative confirms the billing instructions supplied with this form.',20]
 ],[field('billing.contact','Accounts payable contact'),field('billing.email','Invoice recipient email',true,'email'),field('billing.reference','Purchase order / required reference',false),field('billing.instructions','Invoice delivery instructions',false,'textarea')]],
 ['credit-application','Credit Application','CREDIT_APPLICATION',[
  ['Applicant','Legal name: {{customer.legal_name}}\nCompany registration / jurisdiction: {{credit.registration}}',25],
  ['Credit requested','Requested limit: {{credit.limit}}\nCurrency: {{credit.currency}}\nRequested payment terms: {{credit.terms}}',28],
  ['Accounts payable','Contact: {{billing.contact}}\nEmail: {{billing.email}}\nPhone: {{billing.phone}}',28],
  ['Trade references','Provide at least two references, including company name, contact, email or phone, and the business relationship in the completed fields.',24],
  ['Applicant confirmation','The applicant confirms the information supplied is accurate and authorizes contact with the listed trade references to evaluate this application. Submission does not approve credit; the account remains subject to a separate credit decision.',36]
 ],[field('customer.legal_name','Legal company name'),field('credit.registration','Company registration / jurisdiction'),field('credit.limit','Requested credit limit',true,'number'),field('credit.currency','Credit currency (e.g. USD)'),field('credit.terms','Requested payment terms'),field('billing.contact','Accounts payable contact'),field('billing.email','Accounts payable email',true,'email'),field('billing.phone','Accounts payable phone',false),field('credit.references','At least two trade references: company, contact, email / phone and relationship',true,'textarea')]],
 ['rate-agreement','Customer Rate Agreement','RATE_AGREEMENT',[
  ['Customer','{{customer.legal_name}}',16],
  ['Recurring services','The attached rate sheet identifies the recurring services, rates, currencies, units, minimum charges and effective dates agreed for this customer.',32],
  ['How charges are determined','Charges depend on the service performed and the applicable billing quantity. Each rate applies within its stated validity period. Services outside this rate sheet require a separately accepted quote or agreement.',36],
  ['Rate sheet record','The attached rates are a copy of the configured customer rate sheet at the time this document was issued. Later changes to the rate book do not change this signed copy.',32],
  ['Customer acceptance','By signing, the authorized representative accepts the attached recurring rate sheet. This document does not change payment terms, grant credit, or create rates for services omitted from the attached sheet.',36]
 ],[field('customer.legal_name','Legal company name')]],
 ['onboarding-checklist','Customer Onboarding Checklist','ONBOARDING_CHECKLIST',[
  ['Internal review','Customer: {{customer.legal_name}}\nOwner: {{review.owner}}',24],
  ['Profile and contacts','Verify company identity, roles, primary operations contact and billing address.',24],
  ['Commercial setup','Verify recurring rates or an accepted quote, validity dates, payment terms and any credit decision.',28],
  ['Documents','Verify required tax forms, authorizations and agreements. Confirm the signer has authority to act for the customer.',28],
  ['Activation','Review the Entity 360 readiness status and record activation approval separately.',24]
 ],[field('customer.legal_name','Customer legal name'),field('review.owner','Assigned owner'),field('review.notes','Review notes',false,'textarea')]],
 ['customs-poa','Customs Power of Attorney','CUSTOMS_POA',[
  ['Principal','{{customer.legal_name}}, a {{customer.legal_type}}, residing at {{poa.principal_address}} and organized under the laws of {{customer.jurisdiction}}.',30],
  ['Appointment','The principal appoints {{poa.agent_name}}, {{poa.agent_legal_type}}, of {{poa.agent_address}}, as its agent and attorney.',30],
  ['General authority','The appointed agent may perform every lawful act it considers necessary on behalf of the principal, without limitation, as fully as the principal could if present. The principal ratifies lawful acts performed under this authority.',42],
  ['Term and revocation','This authority continues until {{poa.expiry}} or until earlier written notice of revocation is duly given.',27],
  ['Execution','Executed by the principal through the authorized representative identified in the attached signature record.\nDraft based on the general authority example in 19 CFR 141.32. Confirm broker identity and execution requirements before use.',36]
 ],[field('customer.legal_name','Principal legal name'),field('customer.legal_type','Principal legal designation'),field('customer.jurisdiction','Jurisdiction of organization'),field('poa.principal_address','Principal address'),field('poa.agent_name','Appointed agent / broker legal name'),field('poa.agent_legal_type','Agent legal designation'),field('poa.agent_address','Agent address'),field('poa.expiry','Authorization end date',true,'date')]]
 ];
 const templates=specs.map(([key,name,type,sections,fields])=>({id:'nodara-commercial-'+key,name,category:'CRM',status:['customs-poa','onboarding-checklist'].includes(key)?'draft':'published',builtin:true,version:1,placements:[{module:'Customers',recordType:type,surface:key==='onboarding-checklist'?'Hidden/manual':'Onboarding'}],design:design(key,name,sections,fields)}));
 const poa=templates.find(t=>t.id.endsWith('customs-poa'));poa.design.sourceUrl='https://www.ecfr.gov/current/title-19/section-141.32';poa.design.setupNote='Confirm the appointed broker, scope, entity authority and execution requirements before publishing.';
 templates.push({id:'nodara-commercial-w9',name:'W-9 — Official IRS Form',category:'CRM',status:'draft',builtin:true,version:1,placements:[{module:'Customers',recordType:'W9',surface:'Onboarding'}],design:{name:'W-9 — Official IRS Form',pagePreset:'LETTER',pageW:215.9,pageH:279.4,pageColor:'#ffffff',objects:[],background:w9Background,bgX:0,bgY:0,bgW:215.9,bgH:279.4,bgOpacity:1,bgLocked:true,standardRevision:'20261011.1',sourceUrl:'https://www.irs.gov/pub/irs-pdf/fw9.pdf',setupNote:'Official IRS form and full instructions are available below. Complete and upload the official signed PDF through Entity 360. This reference template is not enabled for the generic electronic signing flow.',referenceOnly:true,onboardingFields:[]}});
 return templates;
}

// Recognize only untouched starters from the previous release. Never replace a
// published, archived, duplicated, renamed or otherwise customized template.
const legacyLabels={
 'customer-information':['Legal company name','DBA / trade name','Billing address','Operations contact / email / phone','Billing contact / email / phone','Requested services'],
 'billing-instructions':['Legal company name','Invoice recipient / email','Billing address','Purchase order / reference requirements','Agreed payment terms','Invoice delivery instructions'],
 'credit-application':['Legal company name','Requested credit limit','Accounts payable contact','Trade references','Applicant name / title'],
 'onboarding-checklist':['Customer name','Assigned owner','Contacts and billing address verified','Services and rates agreed','Required authorizations received','Signed agreements received','Activation approval / date']
};
const legacyFields={
 'customer-information':[['customer.legal_name','Legal company name'],['customer.dba_name','DBA / trade name'],['customer.email','Company email'],['customer.phone','Company phone'],['customer.website','Website'],['contact.name','Operations contact name'],['contact.email','Operations contact email'],['contact.phone','Operations contact phone'],['billing.address','Billing street address'],['billing.city','Billing city'],['billing.state','Billing state / region'],['billing.postal','Billing postal code'],['billing.country','Billing country']],
 'billing-instructions':[['billing.contact','Billing contact'],['billing.email','Invoice recipient email'],['billing.reference','Required invoice reference'],['billing.instructions','Invoice delivery instructions']],
 'credit-application':[['customer.legal_name','Legal company name'],['credit.limit','Requested credit limit'],['billing.contact','Accounts payable contact'],['billing.email','Accounts payable email'],['credit.references','Trade references']]
};
export function isUntouchedLegacyStarter(t){
 if(!t.builtin||t.status!=='draft'||t.version!==1||t.versions?.length||t.design?.standardRevision)return false;
 const key=t.id.replace('nodara-commercial-',''),d=t.design||{},labels=legacyLabels[key],names={'w9':'W-9','customs-poa':'Customs Power of Attorney','rate-agreement':'Customer Rate Agreement'};
 if(!labels)return names[key]===t.name&&(!d.objects||d.objects.length===0)&&!d.background&&JSON.stringify(d.onboardingFields)===JSON.stringify((key==='w9'?[['customer.legal_name','Legal company name'],['tax.classification','Tax classification'],['tax.identifier','Taxpayer identification number']]:key==='customs-poa'?[['customer.legal_name','Legal company name'],['customer.jurisdiction','Jurisdiction'],['signer.title','Authorized representative title']]:[['customer.legal_name','Legal company name'],['agreement.start','Agreement start date'],['agreement.end','Agreement end date']]).map(([key,label])=>field(key,label)));
 const expected=[{id:t.id+'-title',type:'text',x:14,y:14,w:185,h:12,text:t.name,fontSize:16,fontFamily:'Arial',fontWeight:'700',textColor:'#111111',border:0},...labels.map((label,i)=>({id:t.id+'-field-'+i,type:'text',x:14,y:40+i*24,w:185,h:20,text:label+'\n______________________________________________________',fontSize:9,fontFamily:'Arial',fontWeight:'400',textColor:'#111111',border:0}))];
 const fields=legacyFields[key]?.map(([key,label])=>field(key,label,['customer.legal_name','customer.email','contact.name','contact.email','billing.address','billing.email'].includes(key),key.endsWith('email')?'email':key==='credit.references'?'textarea':'text'));
 return !d.background&&d.pageW===215.9&&d.pageH===279.4&&JSON.stringify(d.objects)===JSON.stringify(expected)&&(!d.onboardingFields||JSON.stringify(d.onboardingFields)===JSON.stringify(fields));
}
export function installStandardOnboardingTemplates(registry,now,w9Background){
 for(const seed of standardOnboardingTemplates(w9Background)){
  const current=registry.find(t=>t.id===seed.id);
  if(current?.design?.standardRevision)continue;
  if(current&&current.name!==seed.name&&!(current.id.endsWith('w9')&&current.name==='W-9'))continue;
  if(current&&!isUntouchedLegacyStarter(current))continue;
  const installed={...seed,version:current?current.version+1:1,createdAt:current?.createdAt||now,updatedAt:now,publishedAt:seed.status==='published'?now:undefined};
  if(current)registry[registry.indexOf(current)]=installed;else registry.push(installed);
 }
 return registry;
}
