const protectedOperations=[
 {method:'POST',path:/^\/api\/receiving$/},
 {method:'POST',path:/^\/api\/receiving\/[^/]+\/close$/},
 {method:'POST',path:/^\/api\/dispatch\/orders\/[^/]+\/dispatch$/},
 {method:'POST',path:/^\/api\/transfers$/},
 {method:'POST',path:/^\/api\/transfers\/[^/]+\/(ship|receive)$/},
 {method:'POST',path:/^\/api\/logistics\/inventory\/counts$/},
 {method:'PATCH',path:/^\/api\/logistics\/inventory\/counts\/[^/]+\/lines$/},
 {method:'POST',path:/^\/api\/logistics\/inventory\/counts\/[^/]+\/reconcile$/},
 {method:'POST',path:/^\/api\/logistics\/costs\/[^/]+\/reconcile$/},
];
function hash(value:string){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0).toString(36);}
export function getIdempotencyRequest(path:string,method:string,body:unknown){
 const verb=method.toUpperCase();if(!protectedOperations.some(op=>op.method===verb&&op.path.test(path)))return null;
 const payload=typeof body==='string'?body:JSON.stringify(body??null);const storageKey=`erp-idempotency:${verb}:${path}:${hash(payload)}`;
 let key:string;
 try{key=sessionStorage.getItem(storageKey)||crypto.randomUUID();sessionStorage.setItem(storageKey,key);}catch{key=crypto.randomUUID();}
 return {key,complete:()=>{try{sessionStorage.removeItem(storageKey);}catch{}}};
}
