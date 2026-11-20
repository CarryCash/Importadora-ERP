import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const tables = {
  categories: { table: 'product_categories', fields: ['name','parent_id','description','image_url','attributes','is_active','sort_order'] },
  brands: { table: 'product_brands', fields: ['name','manufacturer_id','logo_url','origin_country','website','description','is_active'] },
  manufacturers: { table: 'product_manufacturers', fields: ['name','country','website','description','is_active'] },
  models: { table: 'product_models', fields: ['name','brand_id','description','is_active'] },
  families: { table: 'product_families', fields: ['name','parent_id','description','is_active','sort_order'] },
} as const;
export type CatalogType = keyof typeof tables;

@Injectable()
export class ProductCatalogRepository {
  constructor(private readonly db: DatabaseService) {}

  private config(type: string) {
    const config = tables[type as CatalogType];
    if (!config) throw new BadRequestException('Tipo de catálogo no válido.');
    return config;
  }

  private async validateRelations(companyId: string, type: string, body: Record<string, unknown>, id?: string) {
    const relation = type === 'categories' || type === 'families' ? { field: 'parent_id', table: type === 'categories' ? 'product_categories' : 'product_families' } : type === 'brands' ? { field: 'manufacturer_id', table: 'product_manufacturers' } : type === 'models' ? { field: 'brand_id', table: 'product_brands' } : null;
    const relatedId = relation ? body[relation.field] : null;
    if (relatedId) {
      const exists = await this.db.query(`SELECT 1 FROM ${relation!.table} WHERE id=$1 AND company_id=$2`, [relatedId, companyId]);
      if (!exists.rowCount) throw new BadRequestException('La referencia seleccionada no pertenece a esta empresa.');
      if (id && (type === 'categories' || type === 'families')) {
        const descendants = await this.db.query(`WITH RECURSIVE tree AS (
          SELECT id FROM ${relation!.table} WHERE id=$1 AND company_id=$2
          UNION ALL SELECT child.id FROM ${relation!.table} child JOIN tree parent ON child.parent_id=parent.id WHERE child.company_id=$2
        ) SELECT 1 FROM tree WHERE id=$3 LIMIT 1`, [id, companyId, relatedId]);
        if (descendants.rowCount) throw new BadRequestException('No puedes asignar una categoría o familia descendiente como superior.');
      }
    }
  }

  async list(companyId: string, type: string) {
    const { table } = this.config(type);
    const joins = type === 'brands' ? 'LEFT JOIN product_manufacturers ref ON ref.id=t.manufacturer_id' : type === 'models' ? 'LEFT JOIN product_brands ref ON ref.id=t.brand_id' : type === 'categories' ? 'LEFT JOIN product_categories ref ON ref.id=t.parent_id' : type === 'families' ? 'LEFT JOIN product_families ref ON ref.id=t.parent_id' : '';
    const extra = joins ? ', ref.name AS related_name' : '';
    const result = await this.db.query(`SELECT t.*${extra} FROM ${table} t ${joins} WHERE t.company_id=$1 ORDER BY ${type === 'categories' || type === 'families' ? 't.sort_order, ' : ''}t.name`, [companyId]);
    return result.rows;
  }

  async create(companyId: string, type: string, body: Record<string, unknown>) {
    const { table, fields } = this.config(type);
    await this.validateRelations(companyId, type, body);
    const keys = fields.filter((field) => body[field] !== undefined);
    if (!String(body.name || '').trim()) throw new BadRequestException('El nombre es obligatorio.');
    const values = keys.map((field) => field === 'attributes' ? JSON.stringify(body[field] || {}) : body[field]);
    const columns = ['company_id', ...keys];
    const placeholders = ['$1', ...keys.map((_, index) => `$${index + 2}${keys[index] === 'attributes' ? '::jsonb' : ''}`)];
    const result = await this.db.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`, [companyId, ...values]);
    return result.rows[0];
  }

  async update(companyId: string, type: string, id: string, body: Record<string, unknown>) {
    const { table, fields } = this.config(type);
    await this.validateRelations(companyId, type, body, id);
    const keys = fields.filter((field) => body[field] !== undefined);
    if (!keys.length) throw new BadRequestException('No hay cambios que guardar.');
    const values = keys.map((field) => field === 'attributes' ? JSON.stringify(body[field] || {}) : body[field]);
    const setters = keys.map((field, index) => `${field}=$${index + 3}${field === 'attributes' ? '::jsonb' : ''}`);
    const result = await this.db.query(`UPDATE ${table} SET ${setters.join(',')} WHERE company_id=$1 AND id=$2 RETURNING *`, [companyId, id, ...values]);
    return result.rows[0] || null;
  }
}
