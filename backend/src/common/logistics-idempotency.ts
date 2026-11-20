import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';

export async function claimLogisticsRequest(client:any,companyId:string,operation:string,key:string|undefined,payload:unknown):Promise<any|null>{
 if(!key)return null;
 const requestKey=key.trim();if(requestKey.length<8||requestKey.length>120)throw new BadRequestException('La clave Idempotency-Key debe tener entre 8 y 120 caracteres.');
 const hash=createHash('sha256').update(JSON.stringify(payload??null)).digest('hex');
 const created=await client.query(`INSERT INTO logistics_idempotency_records(company_id,operation_key,request_key,request_hash) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,operation_key,request_key) DO NOTHING RETURNING id`,[companyId,operation,requestKey,hash]);
 if(created.rowCount)return null;
 const existing=await client.query(`SELECT request_hash,response_json FROM logistics_idempotency_records WHERE company_id=$1 AND operation_key=$2 AND request_key=$3 FOR UPDATE`,[companyId,operation,requestKey]);
 if(!existing.rowCount)throw new ConflictException('No se pudo verificar la clave de idempotencia; vuelve a intentarlo.');
 if(existing.rows[0].request_hash!==hash)throw new ConflictException('La clave Idempotency-Key ya se utilizó con datos diferentes.');
 if(existing.rows[0].response_json===null)throw new ConflictException('La operación con esta clave aún no tiene una respuesta final.');
 return existing.rows[0].response_json;
}

export async function completeLogisticsRequest(client:any,companyId:string,operation:string,key:string|undefined,payload:unknown,response:unknown):Promise<void>{
 if(!key)return;
 const hash=createHash('sha256').update(JSON.stringify(payload??null)).digest('hex');
 await client.query(`UPDATE logistics_idempotency_records SET response_json=$5::jsonb,completed_at=NOW() WHERE company_id=$1 AND operation_key=$2 AND request_key=$3 AND request_hash=$4`,[companyId,operation,key.trim(),hash,JSON.stringify(response)]);
}
export async function decrementInventory(client: any, inventoryId: string, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ConflictException('La cantidad de salida debe ser mayor que cero.');
  const result = await client.query(
    'UPDATE inventory SET quantity=quantity-$1,last_updated=CURRENT_TIMESTAMP WHERE id=$2 AND quantity >= $1 RETURNING id',
    [quantity, inventoryId],
  );
  if (!result.rowCount) throw new ConflictException('El saldo de inventario cambió o no es suficiente; actualiza y vuelve a intentar.');
  return result.rows[0];
}

