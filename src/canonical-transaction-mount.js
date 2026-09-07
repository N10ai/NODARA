import { loadTransactionReadModel } from './transaction-read-model.js?v=20260907-2';
import { renderCanonicalContract } from './operations-canonical-detail.js?v=20260907-1';

export async function mountCanonicalTransactionContract(transactionType,domainRecordId,{container=document.getElementById('main'),position='beforeend'}={}){
  if(!container||!transactionType||!domainRecordId)return null;
  container.querySelectorAll('.canonical-contract').forEach(x=>x.remove());
  try{
    const model=await loadTransactionReadModel(transactionType,domainRecordId);
    if(!model)return null;
    container.insertAdjacentHTML(position,renderCanonicalContract(model));
    return model;
  }catch(error){
    console.warn('[NODARA] canonical transaction contract unavailable',transactionType,domainRecordId,error);
    return null;
  }
}

export default mountCanonicalTransactionContract;
