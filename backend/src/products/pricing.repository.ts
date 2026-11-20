import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PricingRepository {
  constructor(private readonly db: DatabaseService) {}
  async lists(companyId:string) {
    return (await this.db.query(`SELECT l.*,c.name customer_name,b.name branch_name,
      (SELECT COUNT(*)::int FROM product_price_rules r WHERE r.price_list_id=l.id) rule_count
      FROM product_price_lists l LEFT JOIN customers c ON c.id=l.customer_id AND c.company_id=l.company_id
      LEFT JOIN branches b ON b.id=l.branch_id AND b.company_id=l.company_id WHERE l.company_id=$1 ORDER BY l.created_at DESC`,[companyId])).rows;
  }
  async create(companyId:string,userId:string,data:any) {
    this.validate(data);
    await this.validateScope(companyId,data);
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const row=await client.query(`INSERT INTO product_price_lists(company_id,name,list_type,currency,rounding_rule,customer_id,customer_segment,branch_id,starts_at,ends_at,max_discount_percent,created_by,last_requested_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,[companyId,String(data.name).trim(),data.list_type,data.currency||'USD',data.rounding_rule||'cent',data.customer_id||null,data.customer_segment||null,data.branch_id||null,data.starts_at||null,data.ends_at||null,Number(data.max_discount_percent||0),userId]);
      await client.query(`INSERT INTO product_price_list_events(company_id,price_list_id,event_type,new_values,actor_id) VALUES($1,$2,'created',$3::jsonb,$4)`,[companyId,row.rows[0].id,JSON.stringify(row.rows[0]),userId]);await client.query('COMMIT');return row.rows[0];
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async update(companyId:string,userId:string,id:string,data:any) {
    this.validate(data);
    await this.validateScope(companyId,data);
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const old=await client.query('SELECT * FROM product_price_lists WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,id]);if(!old.rowCount)throw new NotFoundException('Lista de precios no encontrada.');
      const row=await client.query(`UPDATE product_price_lists SET name=$3,list_type=$4,currency=$5,rounding_rule=$6,customer_id=$7,customer_segment=$8,branch_id=$9,starts_at=$10,ends_at=$11,max_discount_percent=$12,
        approval_status='pending',approved_by=NULL,approved_at=NULL,last_requested_by=$13,updated_at=NOW() WHERE company_id=$1 AND id=$2 RETURNING *`,[companyId,id,String(data.name).trim(),data.list_type,data.currency||'USD',data.rounding_rule||'cent',data.customer_id||null,data.customer_segment||null,data.branch_id||null,data.starts_at||null,data.ends_at||null,Number(data.max_discount_percent||0),userId]);
      await client.query(`INSERT INTO product_price_list_events(company_id,price_list_id,event_type,previous_values,new_values,actor_id) VALUES($1,$2,'updated',$3::jsonb,$4::jsonb,$5)`,[companyId,id,JSON.stringify(old.rows[0]),JSON.stringify(row.rows[0]),userId]);await client.query('COMMIT');return row.rows[0];
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  private validate(data:any) {
    if(!String(data.name||'').trim()||!['retail','wholesale','distributor','special'].includes(data.list_type))throw new BadRequestException('Indica nombre y tipo de lista válido.');
    const discount=Number(data.max_discount_percent||0);if(!Number.isFinite(discount)||discount<0||discount>100)throw new BadRequestException('El descuento máximo debe estar entre 0 y 100%.');
    if(data.starts_at&&data.ends_at&&data.ends_at<data.starts_at)throw new BadRequestException('La fecha final debe ser igual o posterior a la inicial.');
    if(!['USD','EUR','GBP','COP'].includes(data.currency||'USD'))throw new BadRequestException('Moneda no soportada.');
    if(!['cent','whole','five_cents'].includes(data.rounding_rule||'cent'))throw new BadRequestException('Regla de redondeo no válida.');
  }
  private async validateScope(companyId:string,data:any){
    if(data.customer_id){const row=await this.db.query('SELECT 1 FROM customers WHERE id=$1 AND company_id=$2',[data.customer_id,companyId]);if(!row.rowCount)throw new BadRequestException('El cliente no pertenece a esta empresa.');}
    if(data.branch_id){const row=await this.db.query('SELECT 1 FROM branches WHERE id=$1 AND company_id=$2',[data.branch_id,companyId]);if(!row.rowCount)throw new BadRequestException('La sucursal no pertenece a esta empresa.');}
  }
  async rules(companyId:string,id:string) {
    const list=await this.db.query('SELECT id FROM product_price_lists WHERE id=$1 AND company_id=$2',[id,companyId]);if(!list.rowCount)throw new NotFoundException('Lista de precios no encontrada.');
    return (await this.db.query(`SELECT r.*,p.name product_name,p.sku FROM product_price_rules r JOIN products p ON p.id=r.product_id WHERE r.company_id=$1 AND r.price_list_id=$2 ORDER BY p.name,r.min_quantity`,[companyId,id])).rows;
  }
  async saveRule(companyId:string,userId:string,listId:string,data:any) {
    const qty=Number(data.min_quantity||1),price=Number(data.unit_price),discount=Number(data.discount_percent||0);
    if(!data.product_id||!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0||!Number.isFinite(discount)||discount<0||discount>100)throw new BadRequestException('Producto, cantidad mínima, precio y descuento deben ser válidos.');
    if(data.starts_at&&data.ends_at&&data.ends_at<data.starts_at)throw new BadRequestException('La fecha final del precio debe ser igual o posterior a la inicial.');
    const valid=await this.db.query('SELECT id,max_discount_percent FROM product_price_lists WHERE id=$1 AND company_id=$2',[listId,companyId]);if(!valid.rowCount)throw new NotFoundException('Lista de precios no encontrada.');
    if(discount>Number(valid.rows[0].max_discount_percent))throw new BadRequestException('El descuento por volumen supera el máximo autorizado de la lista.');
    const product=await this.db.query('SELECT id FROM products WHERE id=$1 AND company_id=$2',[data.product_id,companyId]);if(!product.rowCount)throw new BadRequestException('El producto no pertenece a esta empresa.');
    const client=this.db.getPool().connect();const connection=await client;try{await connection.query('BEGIN');
      const list=await connection.query('SELECT id FROM product_price_lists WHERE id=$1 AND company_id=$2 FOR UPDATE',[listId,companyId]);if(!list.rowCount)throw new NotFoundException('Lista de precios no encontrada.');
      const old=await connection.query('SELECT * FROM product_price_rules WHERE company_id=$1 AND price_list_id=$2 AND product_id=$3 AND min_quantity=$4 FOR UPDATE',[companyId,listId,data.product_id,qty]);
      const saved=await connection.query(`INSERT INTO product_price_rules(company_id,price_list_id,product_id,min_quantity,unit_price,discount_percent,starts_at,ends_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(price_list_id,product_id,min_quantity) DO UPDATE SET unit_price=EXCLUDED.unit_price,discount_percent=EXCLUDED.discount_percent,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at RETURNING *`,[companyId,listId,data.product_id,qty,price,discount,data.starts_at||null,data.ends_at||null]);
      await connection.query(`INSERT INTO product_price_history(company_id,price_list_id,rule_id,product_id,previous_values,new_values,changed_by) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,[companyId,listId,saved.rows[0].id,data.product_id,old.rowCount?JSON.stringify(old.rows[0]):null,JSON.stringify(saved.rows[0]),userId]);
      const listBefore=await connection.query('SELECT * FROM product_price_lists WHERE company_id=$1 AND id=$2',[companyId,listId]);
      await connection.query("UPDATE product_price_lists SET approval_status='pending',approved_by=NULL,approved_at=NULL,last_requested_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2",[listId,companyId,userId]);
      await connection.query(`INSERT INTO product_price_list_events(company_id,price_list_id,event_type,previous_values,new_values,actor_id) VALUES($1,$2,'submitted',$3::jsonb,$4::jsonb,$5)`,[companyId,listId,JSON.stringify(listBefore.rows[0]),JSON.stringify({...listBefore.rows[0],approval_status:'pending'}),userId]);await connection.query('COMMIT');return saved.rows[0];
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  }
  async approval(companyId:string,userId:string,id:string,decision:string,reason?:string) {
    if(!['approved','rejected'].includes(decision))throw new BadRequestException('Selecciona aprobar o rechazar.');
    if(decision==='rejected'&&!String(reason||'').trim())throw new BadRequestException('Indica el motivo del rechazo.');
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const current=await client.query('SELECT * FROM product_price_lists WHERE id=$1 AND company_id=$2 FOR UPDATE',[id,companyId]);if(!current.rowCount)throw new NotFoundException('Lista de precios no encontrada.');const before=current.rows[0];if(before.approval_status!=='pending')throw new BadRequestException('Solo se puede revisar una solicitud pendiente.');if(before.last_requested_by===userId)throw new BadRequestException('La persona que solicitó el cambio no puede aprobarlo.');
      const row=await client.query(`UPDATE product_price_lists SET approval_status=$3,approved_by=$4,approved_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,[id,companyId,decision,userId]);
      await client.query(`INSERT INTO product_price_list_events(company_id,price_list_id,event_type,previous_values,new_values,reason,actor_id) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,[companyId,id,decision,JSON.stringify(before),JSON.stringify(row.rows[0]),String(reason||'').trim()||null,userId]);await client.query('COMMIT');return row.rows[0];
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async setActive(companyId:string,userId:string,id:string,isActive:boolean){const client=await this.db.getPool().connect();try{await client.query('BEGIN');const before=await client.query('SELECT * FROM product_price_lists WHERE id=$1 AND company_id=$2 FOR UPDATE',[id,companyId]);if(!before.rowCount)throw new NotFoundException('Lista de precios no encontrada.');const row=await client.query('UPDATE product_price_lists SET is_active=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *',[id,companyId,isActive]);await client.query(`INSERT INTO product_price_list_events(company_id,price_list_id,event_type,previous_values,new_values,actor_id) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,[companyId,id,isActive?'activated':'deactivated',JSON.stringify(before.rows[0]),JSON.stringify(row.rows[0]),userId]);await client.query('COMMIT');return row.rows[0];}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
  async history(companyId:string,id:string) { return (await this.db.query(`SELECT h.*,p.name product_name,p.sku,u.full_name changed_by_name FROM product_price_history h JOIN products p ON p.id=h.product_id LEFT JOIN users u ON u.id=h.changed_by WHERE h.company_id=$1 AND h.price_list_id=$2 ORDER BY h.changed_at DESC LIMIT 300`,[companyId,id])).rows; }
  async events(companyId:string,id:string){const exists=await this.db.query('SELECT 1 FROM product_price_lists WHERE id=$1 AND company_id=$2',[id,companyId]);if(!exists.rowCount)throw new NotFoundException('Lista de precios no encontrada.');return (await this.db.query(`SELECT e.*,u.full_name actor_name FROM product_price_list_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.company_id=$1 AND e.price_list_id=$2 ORDER BY e.created_at DESC LIMIT 300`,[companyId,id])).rows;}
  async available(companyId:string,customerId?:string,branchId?:string) {
    return (await this.db.query(`SELECT l.id,l.name,l.list_type,l.currency,l.rounding_rule,l.max_discount_percent,l.customer_id,l.customer_segment,l.branch_id,l.approval_status
      FROM product_price_lists l LEFT JOIN customers c ON c.id=$2 AND c.company_id=l.company_id
      WHERE l.company_id=$1 AND l.is_active AND l.approval_status='approved' AND (l.starts_at IS NULL OR l.starts_at<=CURRENT_DATE) AND (l.ends_at IS NULL OR l.ends_at>=CURRENT_DATE)
      AND (l.customer_id IS NULL OR l.customer_id=$2) AND (l.customer_segment IS NULL OR l.customer_segment=c.customer_type)
      AND (l.branch_id IS NULL OR l.branch_id=$3) AND l.currency='USD' ORDER BY (l.customer_id IS NOT NULL) DESC,(l.branch_id IS NOT NULL) DESC,(l.customer_segment IS NOT NULL) DESC,CASE l.list_type WHEN 'special' THEN 0 WHEN 'distributor' THEN 1 WHEN 'wholesale' THEN 2 ELSE 3 END`,[companyId,customerId||null,branchId||null])).rows;
  }
  async branches(companyId:string){return (await this.db.query('SELECT id,name FROM branches WHERE company_id=$1 AND is_active ORDER BY name',[companyId])).rows;}
}
