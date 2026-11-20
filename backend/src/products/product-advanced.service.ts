import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'crypto';

const relationTypes = ['kit_component', 'substitute', 'related'];

@Injectable()
export class ProductAdvancedService {
  constructor(private readonly db: DatabaseService) {}

  private async product(companyId: string, productId: string) {
    const row = await this.db.query('SELECT id, name, sku, product_type, archived_at FROM products WHERE id=$1 AND company_id=$2', [productId, companyId]);
    if (!row.rowCount) throw new NotFoundException('Producto no encontrado en esta empresa.');
    if (row.rows[0].archived_at) throw new ConflictException('Restaura el producto antes de modificar sus herramientas avanzadas.');
    return row.rows[0];
  }

  async relations(companyId: string, productId: string) {
    await this.product(companyId, productId);
    return (await this.db.query(`SELECT r.*,p.name related_name,p.sku related_sku,p.product_type related_type
      FROM product_relations r JOIN products p ON p.id=r.related_product_id AND p.company_id=r.company_id
      WHERE r.company_id=$1 AND r.product_id=$2 ORDER BY r.relation_type,p.name`, [companyId, productId])).rows;
  }

  async addRelation(companyId: string, userId: string, productId: string, body: any) {
    const parent = await this.product(companyId, productId);
    const relatedId = String(body.related_product_id || '');
    const type = String(body.relation_type || '');
    const quantity = Number(body.quantity ?? 1);
    if (!relationTypes.includes(type)) throw new BadRequestException('El tipo de relación no es válido.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('La cantidad debe ser mayor que cero.');
    if (type === 'kit_component' && parent.product_type !== 'combo') throw new BadRequestException('Cambia el tipo del producto a Combo antes de añadir componentes.');
    const component = await this.db.query('SELECT id,archived_at FROM products WHERE id=$1 AND company_id=$2', [relatedId, companyId]);
    if (!component.rowCount || component.rows[0].archived_at) throw new BadRequestException('Selecciona un producto activo y no archivado de esta empresa.');
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const row=(await client.query(`INSERT INTO product_relations(company_id,product_id,related_product_id,relation_type,quantity,created_by)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [companyId, productId, relatedId, type, quantity, userId])).rows[0];
      await client.query(`INSERT INTO product_audit_events(company_id,product_id,actor_id,action,field_name,before_value,after_value,reason,correlation_id)
        VALUES($1,$2,$3,'updated','product_relation','null'::jsonb,$4::jsonb,'Relación de producto añadida',$5)`,[companyId,productId,userId,JSON.stringify(row),randomUUID()]);
      await client.query('COMMIT');return row;
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') throw new ConflictException('Esa relación ya existe.');
      throw error;
    } finally { client.release(); }
  }

  async removeRelation(companyId: string, userId: string, productId: string, relationId: string) {
    await this.product(companyId, productId);
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');const row=await client.query('DELETE FROM product_relations WHERE id=$1 AND company_id=$2 AND product_id=$3 RETURNING *', [relationId, companyId, productId]);
      if (!row.rowCount) throw new NotFoundException('Relación no encontrada.');
      await client.query(`INSERT INTO product_audit_events(company_id,product_id,actor_id,action,field_name,before_value,after_value,reason,correlation_id)
        VALUES($1,$2,$3,'updated','product_relation',$4::jsonb,'null'::jsonb,'Relación de producto eliminada',$5)`,[companyId,productId,userId,JSON.stringify(row.rows[0]),randomUUID()]);
      await client.query('COMMIT');return { success: true };
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async tags(companyId: string, productId: string) {
    await this.product(companyId, productId);
    return (await this.db.query('SELECT t.* FROM product_tag_assignments a JOIN product_tags t ON t.id=a.tag_id AND t.company_id=a.company_id WHERE a.company_id=$1 AND a.product_id=$2 ORDER BY t.normalized_name', [companyId, productId])).rows;
  }

  async setTags(companyId: string, userId: string, productId: string, input: unknown) {
    await this.product(companyId, productId);
    if (!Array.isArray(input) || input.length > 30) throw new BadRequestException('Indica hasta 30 etiquetas.');
    const names = [...new Set(input.map(value => String(value).trim().replace(/\s+/g, ' ')).filter(Boolean))];
    if (names.some(name => name.length > 60)) throw new BadRequestException('Cada etiqueta admite hasta 60 caracteres.');
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const before=await client.query(`SELECT t.name FROM product_tag_assignments a JOIN product_tags t ON t.id=a.tag_id AND t.company_id=a.company_id WHERE a.company_id=$1 AND a.product_id=$2 ORDER BY t.normalized_name`,[companyId,productId]);
      await client.query('DELETE FROM product_tag_assignments WHERE company_id=$1 AND product_id=$2', [companyId, productId]);
      for (const name of names) {
        const normalized = name.normalize('NFKC').toLocaleLowerCase('es');
        const tag = await client.query(`INSERT INTO product_tags(company_id,name,normalized_name) VALUES($1,$2,$3)
          ON CONFLICT(company_id,normalized_name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [companyId, name, normalized]);
        await client.query('INSERT INTO product_tag_assignments(company_id,product_id,tag_id,created_by) VALUES($1,$2,$3,$4)', [companyId, productId, tag.rows[0].id, userId]);
      }
      await client.query(`INSERT INTO product_audit_events(company_id,product_id,actor_id,action,field_name,before_value,after_value,reason,correlation_id)
        VALUES($1,$2,$3,'updated','tags',$4::jsonb,$5::jsonb,'Etiquetas del producto actualizadas',$6)`,[companyId,productId,userId,JSON.stringify(before.rows.map((row:any)=>row.name)),JSON.stringify(names),randomUUID()]);
      await client.query('COMMIT');
      return this.tags(companyId, productId);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async generateSku(companyId: string, userId: string, productId: string) {
    const product = await this.product(companyId, productId);
    const stem = String(product.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 34) || 'PROD';
    for (let attempt = 0; attempt < 8; attempt++) {
      const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
      const sku = `${stem}-${suffix}`;
      try {
        const client = await this.db.getPool().connect();
        try {
          await client.query('BEGIN');
          const current = await client.query('SELECT sku FROM products WHERE id=$1 AND company_id=$2 FOR UPDATE', [productId, companyId]);
          if (!current.rowCount) throw new NotFoundException('Producto no encontrado.');
          if (current.rows[0].sku) throw new ConflictException('El producto ya tiene un SKU; edítalo manualmente si necesitas cambiarlo.');
          const result = await client.query('UPDATE products SET sku=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING sku', [productId, companyId, sku]);
          await client.query(`INSERT INTO product_audit_events(company_id,product_id,actor_id,action,field_name,before_value,after_value,reason,correlation_id)
            VALUES($1,$2,$3,'updated','sku','null'::jsonb,$4::jsonb,'SKU generado desde herramientas avanzadas',$5)`, [companyId, productId, userId, JSON.stringify(sku), randomUUID()]);
          await client.query('COMMIT');
          return { sku: result.rows[0].sku };
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      } catch (error: any) { if (error instanceof ConflictException || error instanceof NotFoundException) throw error; if (error?.code !== '23505') throw error; }
    }
    throw new ConflictException('No se pudo generar un SKU único; vuelve a intentarlo.');
  }

  async generateInternalCode(companyId: string, userId: string, productId: string) {
    await this.product(companyId, productId);
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM products WHERE id=$1 AND company_id=$2 FOR UPDATE', [productId, companyId]);
      const existing = await client.query("SELECT value FROM product_identifiers WHERE company_id=$1 AND product_id=$2 AND identifier_type='internal' LIMIT 1", [companyId, productId]);
      if (existing.rowCount) throw new ConflictException('Este producto ya tiene un código interno.');
      const value = `INT-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      await client.query("INSERT INTO product_identifiers(company_id,product_id,identifier_type,value,normalized_value,is_primary,created_by) VALUES($1,$2,'internal',$3,$4,false,$5)", [companyId, productId, value, value, userId]);
      await client.query(`INSERT INTO product_audit_events(company_id,product_id,actor_id,action,field_name,before_value,after_value,reason,correlation_id)
        VALUES($1,$2,$3,'identifiers_changed','internal_code','null'::jsonb,$4::jsonb,'Código interno generado desde herramientas avanzadas',$5)`, [companyId, productId, userId, JSON.stringify(value), randomUUID()]);
      await client.query('COMMIT');
      return { code: value };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
