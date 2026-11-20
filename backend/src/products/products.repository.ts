import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';

type ProductPayload = Record<string, any>;

@Injectable()
export class ProductsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll(companyId: string, filters: { search?: string; includeArchived?: boolean } = {}) {
    const term = String(filters.search || '').trim();
    const result = await this.db.query(`SELECT p.*, COALESCE(c.name,p.category) AS category_name,
      COALESCE(b.name,p.brand) AS brand_name, m.name AS manufacturer_name, mo.name AS model_name, f.name AS family_name,
      (SELECT COUNT(*)::int FROM product_identifiers pi WHERE pi.company_id=p.company_id AND pi.product_id=p.id) AS identifier_count
      FROM products p LEFT JOIN product_categories c ON c.id=p.category_id AND c.company_id=p.company_id
      LEFT JOIN product_brands b ON b.id=p.brand_id AND b.company_id=p.company_id
      LEFT JOIN product_manufacturers m ON m.id=p.manufacturer_id AND m.company_id=p.company_id
      LEFT JOIN product_models mo ON mo.id=p.model_id AND mo.company_id=p.company_id
      LEFT JOIN product_families f ON f.id=p.family_id AND f.company_id=p.company_id
      WHERE p.company_id=$1 AND ($2::boolean OR p.archived_at IS NULL)
      AND ($3='' OR CONCAT_WS(' ',p.name,p.commercial_name,p.sku,p.barcode,COALESCE(c.name,p.category),COALESCE(b.name,p.brand),mo.name,p.reference) ILIKE '%'||$3||'%')
      ORDER BY p.created_at DESC`, [companyId, Boolean(filters.includeArchived), term]);
    return result.rows;
  }

  async findById(companyId: string, id: string) {
    const result = await this.db.query(`SELECT p.*,COALESCE(c.name,p.category) category_name,COALESCE(b.name,p.brand) brand_name,
      m.name manufacturer_name,mo.name model_name,f.name family_name
      FROM products p LEFT JOIN product_categories c ON c.id=p.category_id AND c.company_id=p.company_id
      LEFT JOIN product_brands b ON b.id=p.brand_id AND b.company_id=p.company_id
      LEFT JOIN product_manufacturers m ON m.id=p.manufacturer_id AND m.company_id=p.company_id
      LEFT JOIN product_models mo ON mo.id=p.model_id AND mo.company_id=p.company_id
      LEFT JOIN product_families f ON f.id=p.family_id AND f.company_id=p.company_id
      WHERE p.id=$1 AND p.company_id=$2`, [id, companyId]);
    return result.rows[0] || null;
  }

  async identifiers(companyId: string, productId: string) {
    return (await this.db.query('SELECT * FROM product_identifiers WHERE company_id=$1 AND product_id=$2 ORDER BY is_primary DESC,created_at,id',[companyId,productId])).rows;
  }

  async attributeValues(companyId: string, productId: string) {
    return (await this.db.query(`SELECT v.definition_id,v.value,d.code,d.name,d.data_type,d.unit,d.options,d.is_required
      FROM product_attribute_values v JOIN product_attribute_definitions d ON d.id=v.definition_id AND d.company_id=v.company_id
      WHERE v.company_id=$1 AND v.product_id=$2 ORDER BY d.sort_order,d.name`,[companyId,productId])).rows;
  }

  async create(companyId: string, userId: string, product: ProductPayload) {
    const connection = await this.db.getPool().connect();
    const correlationId=randomUUID();
    try {
      await connection.query('BEGIN');
      const result = await connection.query(`INSERT INTO products(company_id,name,commercial_name,short_description,description,sku,product_type,
        category,category_id,brand,brand_id,manufacturer_id,model_id,family_id,parent_product_id,reference,price,cost_price,sale_price,wholesale_price,iva_rate,image_url,barcode,details,min_stock,lead_time_days,is_active)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25,$26,$27) RETURNING *`,
      [companyId,product.name,product.commercial_name||product.name,product.short_description||null,product.description||null,product.sku||null,product.product_type||'physical',
        product.category||null,product.category_id||null,product.brand||null,product.brand_id||null,product.manufacturer_id||null,product.model_id||null,product.family_id||null,product.parent_product_id||null,product.reference||null,
        Number(product.price||product.sale_price||0),Number(product.cost_price||0),Number(product.sale_price||product.price||0),product.wholesale_price===undefined?null:Number(product.wholesale_price),Number(product.iva_rate??13),product.image_url||null,product.barcode||null,JSON.stringify(product.details||{}),product.min_stock??20,product.lead_time_days??45,product.is_active!==false]);
      const saved=result.rows[0];
      await this.replaceIdentifiers(connection,companyId,userId,saved.id,product.identifiers||[]);
      await this.replaceAttributes(connection,companyId,userId,saved.id,product.attribute_values||[]);
      await connection.query(`INSERT INTO product_audit_events(company_id,product_id,actor_id,action,after_value,reason,correlation_id)
        VALUES($1,$2,$3,'created',$4::jsonb,$5,$6)`,[companyId,saved.id,userId||null,JSON.stringify(this.auditSnapshot(saved)),'Alta de producto',correlationId]);
      await connection.query('COMMIT');
      return this.findById(companyId,saved.id);
    } catch(error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }
  }

  async update(companyId: string, userId: string, id: string, product: ProductPayload) {
    const connection=await this.db.getPool().connect();
    const correlationId=randomUUID();
    try {
      await connection.query('BEGIN');
      const current=await connection.query('SELECT * FROM products WHERE id=$1 AND company_id=$2 AND archived_at IS NULL FOR UPDATE',[id,companyId]);
      if(!current.rowCount){await connection.query('ROLLBACK');return null;}
      const before=current.rows[0];
      const columns=['name','commercial_name','short_description','description','sku','product_type','category','category_id','brand','brand_id','manufacturer_id','model_id','family_id','parent_product_id','reference','price','cost_price','sale_price','wholesale_price','iva_rate','image_url','details','min_stock','lead_time_days','is_active'];
      const values:Record<string,unknown>={...product,details:JSON.stringify(product.details||before.details||{})};
      const keys=columns.filter(key=>values[key]!==undefined);
      const params:any[]=[id,companyId];
      const setters=keys.map(key=>{params.push(values[key]);return `${key}=$${params.length}${key==='details'?'::jsonb':''}`;});
      if(product.identifiers!==undefined){params.push(product.barcode||null);setters.push(`barcode=$${params.length}`);}
      setters.push('updated_at=CURRENT_TIMESTAMP');
      const saved=await connection.query(`UPDATE products SET ${setters.join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,params);
      const after=saved.rows[0];
      const beforeIdentifiers=product.identifiers!==undefined?await connection.query('SELECT identifier_type,value,is_primary FROM product_identifiers WHERE company_id=$1 AND product_id=$2 ORDER BY identifier_type,normalized_value',[companyId,id]):null;
      const beforeAttributes=product.attribute_values!==undefined?await connection.query('SELECT definition_id,value FROM product_attribute_values WHERE company_id=$1 AND product_id=$2 ORDER BY definition_id',[companyId,id]):null;
      if(product.identifiers!==undefined)await this.replaceIdentifiers(connection,companyId,userId,id,product.identifiers);
      if(product.attribute_values!==undefined)await this.replaceAttributes(connection,companyId,userId,id,product.attribute_values);

      let eventCount=0;let relatedDataChanged=false;
      for(const field of keys){
        const oldValue=before[field],newValue=after[field];
        if(JSON.stringify(oldValue??null)!==JSON.stringify(newValue??null)){
          await connection.query(`INSERT INTO product_audit_events(company_id,product_id,actor_id,action,field_name,before_value,after_value,reason,correlation_id)
            VALUES($1,$2,$3,'updated',$4,$5::jsonb,$6::jsonb,$7,$8)`,[companyId,id,userId||null,field,JSON.stringify(oldValue??null),JSON.stringify(newValue??null),product.change_reason||null,correlationId]);eventCount++;
        }
      }
      if(beforeIdentifiers){const afterIdentifiers=await connection.query('SELECT identifier_type,value,is_primary FROM product_identifiers WHERE company_id=$1 AND product_id=$2 ORDER BY identifier_type,normalized_value',[companyId,id]);if(JSON.stringify(beforeIdentifiers.rows)!==JSON.stringify(afterIdentifiers.rows)){relatedDataChanged=true;await this.insertAudit(connection,companyId,id,userId,'identifiers_changed',beforeIdentifiers.rows,afterIdentifiers.rows,product.change_reason,correlationId);}}
      if(beforeAttributes){const afterAttributes=await connection.query('SELECT definition_id,value FROM product_attribute_values WHERE company_id=$1 AND product_id=$2 ORDER BY definition_id',[companyId,id]);if(JSON.stringify(beforeAttributes.rows)!==JSON.stringify(afterAttributes.rows)){relatedDataChanged=true;await this.insertAudit(connection,companyId,id,userId,'attributes_changed',beforeAttributes.rows,afterAttributes.rows,product.change_reason,correlationId);}}
      if((eventCount>0||relatedDataChanged)&&!String(product.change_reason||'').trim())throw new BadRequestException('Indica el motivo del cambio para dejar una auditoría completa.');
      if(!eventCount&&!beforeIdentifiers&&!beforeAttributes&&product.change_reason)await this.insertAudit(connection,companyId,id,userId,'updated',null,{reason:product.change_reason},product.change_reason,correlationId);
      await connection.query('COMMIT');return this.findById(companyId,id);
    }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  }

  async updateTaxRate(companyId:string,userId:string,id:string,rate:number) {
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const before=await client.query('SELECT iva_rate FROM products WHERE id=$1 AND company_id=$2 AND archived_at IS NULL FOR UPDATE',[id,companyId]);if(!before.rowCount){await client.query('ROLLBACK');return null;}const after=await client.query('UPDATE products SET iva_rate=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING iva_rate',[rate,id,companyId]);await this.insertAudit(client,companyId,id,userId,'updated',before.rows[0],after.rows[0],'Cambio de tarifa IVA');await client.query('COMMIT');return {id,name:(await this.findById(companyId,id))?.name,iva_rate:after.rows[0].iva_rate};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async updateStatus(companyId:string,userId:string,id:string,isActive:boolean,reason?:string) {
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const before=await client.query('SELECT is_active,archived_at FROM products WHERE id=$1 AND company_id=$2 AND archived_at IS NULL FOR UPDATE',[id,companyId]);if(!before.rowCount){await client.query('ROLLBACK');return null;}if(Boolean(before.rows[0].is_active)!==Boolean(isActive)&&!String(reason||'').trim())throw new BadRequestException('Indica el motivo para activar o desactivar el producto.');const after=await client.query('UPDATE products SET is_active=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING is_active',[isActive,id,companyId]);await this.insertAudit(client,companyId,id,userId,isActive?'activated':'deactivated',before.rows[0],after.rows[0],reason||null);await client.query('COMMIT');return {id,name:(await this.findById(companyId,id))?.name,is_active:after.rows[0].is_active};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async archive(companyId:string,userId:string,id:string,reason:string) {
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const before=await client.query('SELECT * FROM products WHERE id=$1 AND company_id=$2 AND archived_at IS NULL FOR UPDATE',[id,companyId]);if(!before.rowCount){await client.query('ROLLBACK');return null;}
      const stock=await client.query(`SELECT COALESCE(SUM(i.quantity),0) quantity FROM product_batches b JOIN inventory i ON i.batch_id=b.id WHERE b.product_id=$1 AND i.quantity>0`,[id]);if(Number(stock.rows[0].quantity)>0)throw new ConflictException('No se puede archivar el producto mientras tenga existencias. Ajusta o transfiere el stock desde Inventario.');
      const after=await client.query('UPDATE products SET is_active=false,archived_at=NOW(),archived_by=$1,archive_reason=$2,updated_at=NOW() WHERE id=$3 AND company_id=$4 RETURNING is_active,archived_at,archive_reason',[userId||null,reason,id,companyId]);await this.insertAudit(client,companyId,id,userId,'archived',before.rows[0],after.rows[0],reason);await client.query('COMMIT');return this.findById(companyId,id);
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async restore(companyId:string,userId:string,id:string,reason:string) {
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const before=await client.query('SELECT is_active,archived_at,archive_reason FROM products WHERE id=$1 AND company_id=$2 AND archived_at IS NOT NULL FOR UPDATE',[id,companyId]);if(!before.rowCount){await client.query('ROLLBACK');return null;}const after=await client.query('UPDATE products SET is_active=false,archived_at=NULL,archived_by=NULL,archive_reason=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING is_active,archived_at',[id,companyId]);await this.insertAudit(client,companyId,id,userId,'restored',before.rows[0],after.rows[0],reason);await client.query('COMMIT');return this.findById(companyId,id);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async history(companyId:string,id:string){return (await this.db.query(`SELECT a.*,u.full_name actor_name FROM product_audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.company_id=$1 AND a.product_id=$2 ORDER BY a.created_at DESC,a.id DESC LIMIT 500`,[companyId,id])).rows;}

  async barcodeExists(companyId:string,barcode:string,excludeProductId?:string){const result=await this.db.query('SELECT 1 FROM product_identifiers WHERE company_id=$1 AND normalized_value=$2 AND ($3::uuid IS NULL OR product_id<>$3) LIMIT 1',[companyId,barcode,excludeProductId||null]);return Boolean(result.rowCount);}

  private async replaceIdentifiers(client:any,companyId:string,userId:string,productId:string,items:any[]) {
    await client.query('DELETE FROM product_identifiers WHERE company_id=$1 AND product_id=$2',[companyId,productId]);
    for(const item of items){const value=String(item.value||'').trim();if(!value)continue;const normalized=value.normalize('NFKC').toUpperCase().replace(/[\s-]/g,'');await client.query(`INSERT INTO product_identifiers(company_id,product_id,identifier_type,value,normalized_value,is_primary,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,[companyId,productId,item.type,value,normalized,Boolean(item.is_primary),userId||null]);}
  }
  private async replaceAttributes(client:any,companyId:string,userId:string,productId:string,items:any[]) {
    await client.query('DELETE FROM product_attribute_values WHERE company_id=$1 AND product_id=$2',[companyId,productId]);
    for(const item of items){if(item.value===undefined||item.value===null||item.value==='')continue;await client.query(`INSERT INTO product_attribute_values(company_id,product_id,definition_id,value,updated_by) VALUES($1,$2,$3,$4::jsonb,$5)`,[companyId,productId,item.definition_id,JSON.stringify(item.value),userId||null]);}
  }
  private auditSnapshot(product:any){return {name:product.name,commercial_name:product.commercial_name,sku:product.sku,product_type:product.product_type,category_id:product.category_id,brand_id:product.brand_id,manufacturer_id:product.manufacturer_id,model_id:product.model_id,family_id:product.family_id,sale_price:product.sale_price,iva_rate:product.iva_rate,is_active:product.is_active};}
  private async insertAudit(client:any,companyId:string,id:string,userId:string,action:string,before:any,after:any,reason?:string|null,correlationId=randomUUID()){await client.query(`INSERT INTO product_audit_events(company_id,product_id,actor_id,action,before_value,after_value,reason,correlation_id) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,[companyId,id,userId||null,action,before===null?null:JSON.stringify(before),after===null?null:JSON.stringify(after),reason||null,correlationId]);}
}
