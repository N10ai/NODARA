export const TRANSACTION_UX={
 WAREHOUSE_RECEIPT:{label:'Warehouse Receipt',steps:[
  {code:'CHECK_IN',label:'Check in',hint:'Driver, carrier and security verification'},
  {code:'INSPECT',label:'Inspect',hint:'BOL, count, condition and exceptions'},
  {code:'RECEIVE',label:'Receive',hint:'Cargo, measurements, flags, photos and labels'},
  {code:'PUT_AWAY',label:'Put away',hint:'Assign and scan-verify location'},
  {code:'NOTIFY',label:'Notify',hint:'Final documents and customer notification'}
 ]},
 CARGO_RELEASE:{label:'Cargo Release',steps:[
  {code:'VERIFY',label:'Verify',hint:'Release authority, parties and references'},
  {code:'ALLOCATE',label:'Allocate',hint:'Select eligible warehouse cargo'},
  {code:'PICK',label:'Pick',hint:'Scan-verify cargo and locations'},
  {code:'RELEASE',label:'Release',hint:'Driver, carrier, documents and physical release'},
  {code:'CONFIRM',label:'Confirm',hint:'POD, inventory posting and customer notification'}
 ]},
 SHIPMENT:{label:'Shipment',steps:[
  {code:'PLAN',label:'Plan',hint:'Parties, cargo and routing requirements'},
  {code:'BOOK',label:'Book',hint:'Carrier, schedule and booking references'},
  {code:'EXECUTE',label:'Execute',hint:'Tender, documents and movement milestones'},
  {code:'TRACK',label:'Track',hint:'Exceptions and in-transit milestones'},
  {code:'CLOSE',label:'Close',hint:'Delivery, costs, documents and notification'}
 ]},
 TRANSPORT_ORDER:{label:'Transport Order',steps:[
  {code:'PLAN',label:'Plan',hint:'Pickup/delivery parties, cargo and references'},
  {code:'DISPATCH',label:'Dispatch',hint:'Carrier, driver and equipment'},
  {code:'PICKUP',label:'Pickup',hint:'Check-in, scan and proof of pickup'},
  {code:'DELIVER',label:'Deliver',hint:'Scan, exception handling and POD'},
  {code:'CLOSE',label:'Close',hint:'Times, charges and customer notification'}
 ]}
};
export function transactionUx(type){return TRANSACTION_UX[type]||{label:type,steps:[]}}
export function workflowProgress(steps=[],completed=[]){const done=new Set(completed||[]);let current=steps.findIndex(s=>!done.has(s.code));if(current<0)current=steps.length;return{current,done,total:steps.length,complete:steps.length>0&&current===steps.length}}
