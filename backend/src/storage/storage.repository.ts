import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { decrementInventory } from '../common/logistics-idempotency';

@Injectable()
export class StorageRepository {
  constructor(private readonly db: DatabaseService) {}

  async locations(companyId: string, warehouseId?: string) {
    const params: any[] = [companyId];
    const filter = warehouseId ? `AND l.warehouse_id=$${params.push(warehouseId)}` : '';
    const result = await this.db.query(`
      SELECT l.*,w.name AS warehouse_name,
        COALESCE(o.quantity,0) AS occupied_units, COALESCE(o.weight_kg,0) AS occupied_weight_kg,
        COALESCE(o.volume_m3,0) AS occupied_volume_m3, COALESCE(o.pallets,0) AS occupied_pallets,
        COALESCE(o.product_count,0) AS product_count,
        CASE WHEN l.capacity_units>0 THEN ROUND(COALESCE(o.quantity,0)*100/l.capacity_units,1) ELSE 0 END AS units_occupancy_percent
      FROM storage_locations l JOIN warehouses w ON w.id=l.warehouse_id
      LEFT JOIN LATERAL (
        SELECT SUM(i.quantity) quantity,SUM(i.quantity*p.weight_kg) weight_kg,
          SUM(i.quantity*p.volume_m3) volume_m3,SUM(i.quantity/p.units_per_pallet) pallets,
          COUNT(DISTINCT b.product_id) product_count
        FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id
        WHERE i.storage_location_id=l.id
      ) o ON true
      WHERE l.company_id=$1 ${filter}
      ORDER BY w.name,l.zone NULLS FIRST,l.aisle NULLS FIRST,l.rack NULLS FIRST,l.level NULLS FIRST,l.position NULLS FIRST,l.code`, params);
    return result.rows;
  }

  async inventory(companyId: string, warehouseId?: string, search = '') {
    const params: any[] = [companyId];
    const clauses = ['w.company_id=$1'];
    if (warehouseId) clauses.push(`w.id=$${params.push(warehouseId)}`);
    if (search.trim()) clauses.push(`(p.name ILIKE $${params.push(`%${search.trim()}%`)} OR p.sku ILIKE $${params.length} OR b.batch_number ILIKE $${params.length} OR l.code ILIKE $${params.length})`);
    const result = await this.db.query(`SELECT i.id AS inventory_id,i.batch_id,i.quantity,i.stock_status,
      p.id AS product_id,p.name AS product_name,p.sku,p.category,p.weight_kg,p.volume_m3,p.units_per_pallet,p.is_hazardous,p.hazard_class,
      b.batch_number,b.expiration_date,l.id AS location_id,l.code AS location_code,l.name AS location_name,l.location_type,
      w.id AS warehouse_id,w.name AS warehouse_name
      FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id JOIN product_batches b ON b.id=i.batch_id
      JOIN products p ON p.id=b.product_id JOIN storage_locations l ON l.id=i.storage_location_id
      WHERE ${clauses.join(' AND ')} ORDER BY p.name,b.expiration_date NULLS LAST,l.code`, params);
    return result.rows;
  }

  async movements(companyId: string, warehouseId?: string) {
    const params:any[]=[companyId];
    const filter=warehouseId?`AND m.warehouse_id=$${params.push(warehouseId)}`:'';
    return (await this.db.query(`SELECT m.*,p.name AS product_name,p.sku,b.batch_number,
      source.code AS from_location_code,target.code AS to_location_code,u.username AS created_by_name
      FROM storage_movements m JOIN products p ON p.id=m.product_id JOIN product_batches b ON b.id=m.batch_id
      LEFT JOIN storage_locations source ON source.id=m.from_location_id LEFT JOIN storage_locations target ON target.id=m.to_location_id
      LEFT JOIN users u ON u.id=m.created_by WHERE m.company_id=$1 ${filter} ORDER BY m.created_at DESC LIMIT 100`,params)).rows;
  }

  async suggestions(companyId: string, inventoryId: string, requestedQuantity = 1, targetStatus = 'available') {
    const item = await this.db.query(`SELECT i.*,b.product_id,p.category,p.weight_kg,p.volume_m3,p.units_per_pallet,p.is_hazardous,p.hazard_class,
      l.warehouse_id,l.id AS source_location_id
      FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id
      JOIN storage_locations l ON l.id=i.storage_location_id JOIN warehouses w ON w.id=l.warehouse_id
      WHERE i.id=$1 AND w.company_id=$2`, [inventoryId,companyId]);
    if (!item.rowCount) return [];
    const row = item.rows[0];
    const result = await this.db.query(`SELECT l.*,COALESCE(o.quantity,0) occupied_units,
      CASE WHEN l.capacity_units>0 THEN l.capacity_units-COALESCE(o.quantity,0) ELSE $2::numeric END available_units,
      COALESCE(o.weight_kg,0) occupied_weight_kg,COALESCE(o.volume_m3,0) occupied_volume_m3,COALESCE(o.pallets,0) occupied_pallets,
      COALESCE(o.product_ids,'{}') product_ids,
      CASE WHEN l.id=$3 THEN 0 ELSE 1 END AS source_penalty,
      COALESCE((SELECT MIN(r.priority) FROM storage_rules r WHERE r.company_id=$1 AND r.is_active
        AND (r.product_id=$4 OR (r.product_id IS NULL AND r.category=$5))
        AND (r.preferred_location_id=l.id OR r.required_location_type=l.location_type)),500) rule_priority
      FROM storage_locations l LEFT JOIN LATERAL(
        SELECT SUM(i.quantity) quantity,SUM(i.quantity*p.weight_kg) weight_kg,SUM(i.quantity*p.volume_m3) volume_m3,SUM(i.quantity/p.units_per_pallet) pallets,
          ARRAY_AGG(DISTINCT b.product_id) product_ids
        FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id WHERE i.storage_location_id=l.id
      ) o ON true
      WHERE l.company_id=$1 AND l.warehouse_id=$6 AND l.status='active'
        AND l.id<>$3
        AND ($12<>'quarantine' OR l.location_type='quarantine')
        AND ($12<>'damaged' OR l.location_type='quarantine')
        AND (l.capacity_units=0 OR COALESCE(o.quantity,0)+$2<=l.capacity_units)
        AND (l.capacity_weight_kg=0 OR COALESCE(o.weight_kg,0)+$2*$7<=l.capacity_weight_kg)
        AND (l.capacity_volume_m3=0 OR COALESCE(o.volume_m3,0)+$2*$8<=l.capacity_volume_m3)
        AND (l.capacity_pallets=0 OR COALESCE(o.pallets,0)+$2/$11<=l.capacity_pallets)
        AND (l.allow_mixed_products OR COALESCE(o.product_ids,'{}') <@ ARRAY[$4]::uuid[] OR COALESCE(o.product_ids,'{}')='{}')
        AND (NOT $9::boolean OR (l.allows_hazardous AND (CARDINALITY(l.allowed_hazard_classes)=0 OR $10=ANY(l.allowed_hazard_classes))))
        AND (CARDINALITY(l.compatible_categories)=0 OR $5=ANY(l.compatible_categories))
        AND NOT EXISTS(SELECT 1 FROM storage_rules r WHERE r.company_id=$1 AND r.is_active AND (r.product_id=$4 OR (r.product_id IS NULL AND r.category=$5))
          AND CARDINALITY(r.incompatible_categories)>0 AND EXISTS(SELECT 1 FROM inventory oi JOIN product_batches ob ON ob.id=oi.batch_id JOIN products op ON op.id=ob.product_id WHERE oi.storage_location_id=l.id AND op.category=ANY(r.incompatible_categories)))
      ORDER BY source_penalty,rule_priority,l.is_default DESC,l.code LIMIT 20`, [companyId,requestedQuantity,row.source_location_id,row.product_id,row.category,row.warehouse_id,row.weight_kg,row.volume_m3,row.is_hazardous,row.hazard_class,row.units_per_pallet,targetStatus]);
    return result.rows;
  }

  async replenishment(companyId: string, warehouseId?: string) {
    const params: any[] = [companyId];
    const filter = warehouseId ? `AND w.id=$${params.push(warehouseId)}` : '';
    const result = await this.db.query(`SELECT pick.id AS picking_location_id,pick.code AS picking_code,pick.warehouse_id,w.name AS warehouse_name,
      b.product_id,p.name AS product_name,p.sku,b.id AS batch_id,b.batch_number,b.expiration_date,
      COALESCE(pick_stock.quantity,0) AS picking_quantity,pick.pick_minimum,pick.pick_maximum,
      source.id AS source_inventory_id,source.location_code AS source_code,source.quantity AS source_quantity,
      LEAST(source.quantity,GREATEST(0,pick.pick_maximum-COALESCE(pick_stock.quantity,0))) AS suggested_quantity
      FROM storage_locations pick JOIN warehouses w ON w.id=pick.warehouse_id
      JOIN product_batches b ON true JOIN products p ON p.id=b.product_id
      LEFT JOIN LATERAL (SELECT SUM(i.quantity) quantity FROM inventory i WHERE i.batch_id=b.id AND i.storage_location_id=pick.id AND i.stock_status='available') pick_stock ON true
      JOIN LATERAL (SELECT i.id,i.quantity,l.code AS location_code FROM inventory i JOIN storage_locations l ON l.id=i.storage_location_id
        WHERE i.batch_id=b.id AND i.warehouse_id=pick.warehouse_id AND i.stock_status='available' AND l.location_type='storage' AND l.status='active' AND i.quantity>0
        ORDER BY b.expiration_date NULLS LAST,i.quantity DESC LIMIT 1) source ON true
      WHERE pick.company_id=$1 AND pick.location_type='picking' AND pick.status='active' AND pick.pick_minimum>0
        AND COALESCE(pick_stock.quantity,0)<pick.pick_minimum AND source.quantity>0
        AND EXISTS(SELECT 1 FROM storage_rules assignment WHERE assignment.company_id=pick.company_id AND assignment.is_active
          AND assignment.preferred_location_id=pick.id AND (assignment.product_id=b.product_id OR assignment.category=p.category)) ${filter}
      ORDER BY (COALESCE(pick_stock.quantity,0)/pick.pick_minimum),p.name,b.expiration_date NULLS LAST`, params);
    return result.rows;
  }

  async createLocation(companyId: string, data: any) {
    const result = await this.db.query(`INSERT INTO storage_locations(company_id,warehouse_id,code,name,zone,aisle,rack,level,position,location_type,
      capacity_units,capacity_weight_kg,capacity_volume_m3,capacity_pallets,pick_minimum,pick_maximum,allow_mixed_products,allows_hazardous,allowed_hazard_classes,compatible_categories,is_default,notes)
      SELECT $1,w.id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22 FROM warehouses w WHERE w.id=$2 AND w.company_id=$1 RETURNING *`,
      [companyId,data.warehouse_id,String(data.code).trim(),String(data.name).trim(),data.zone||null,data.aisle||null,data.rack||null,data.level||null,data.position||null,data.location_type||'storage',Number(data.capacity_units||0),Number(data.capacity_weight_kg||0),Number(data.capacity_volume_m3||0),Number(data.capacity_pallets||0),Number(data.pick_minimum||0),Number(data.pick_maximum||0),data.allow_mixed_products!==false,Boolean(data.allows_hazardous),data.allowed_hazard_classes||[],data.compatible_categories||[],Boolean(data.is_default),data.notes||null]);
    if (!result.rowCount) throw new BadRequestException('La bodega no pertenece a esta empresa.');
    if (data.is_default) await this.setDefault(companyId,data.warehouse_id,result.rows[0].id);
    return result.rows[0];
  }

  async updateLocation(companyId: string, id: string, data: any) {
    const allowed = ['name','zone','aisle','rack','level','position','location_type','status','capacity_units','capacity_weight_kg','capacity_volume_m3','capacity_pallets','pick_minimum','pick_maximum','allow_mixed_products','allows_hazardous','allowed_hazard_classes','compatible_categories','is_default','notes'];
    const fields = allowed.filter((field) => data[field] !== undefined);
    if (!fields.length) return (await this.db.query('SELECT * FROM storage_locations WHERE company_id=$1 AND id=$2',[companyId,id])).rows[0] || null;
    const values = fields.map((field) => data[field]);
    const sets = fields.map((field,index) => `${field}=$${index+3}`);
    const result = await this.db.query(`UPDATE storage_locations l SET ${sets.join(',')},updated_at=CURRENT_TIMESTAMP FROM warehouses w
      WHERE w.id=l.warehouse_id AND w.company_id=$1 AND l.id=$2 RETURNING l.*`, [companyId,id,...values]);
    const location = result.rows[0];
    if (location && data.is_default) await this.setDefault(companyId,location.warehouse_id,location.id);
    return location || null;
  }

  private async setDefault(companyId: string, warehouseId: string, locationId: string) {
    await this.db.query('UPDATE storage_locations SET is_default=(id=$3),updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND warehouse_id=$2',[companyId,warehouseId,locationId]);
  }

  async move(companyId: string, userId: string, data: any) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const source = await client.query(`SELECT i.*,b.product_id,p.category,p.weight_kg,p.volume_m3,p.units_per_pallet,p.is_hazardous,p.hazard_class,l.warehouse_id,l.location_type AS source_type
        FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id JOIN storage_locations l ON l.id=i.storage_location_id
        JOIN warehouses w ON w.id=l.warehouse_id WHERE i.id=$1 AND w.company_id=$2 FOR UPDATE OF i`,[data.inventory_id,companyId]);
      if (!source.rowCount) throw new NotFoundException('No existe la línea de inventario.');
      const item=source.rows[0];
      if (Number(item.quantity)<data.quantity) throw new BadRequestException('La cantidad supera las existencias disponibles en la ubicación.');
      const targetRes=await client.query('SELECT * FROM storage_locations WHERE id=$1 AND company_id=$2 FOR UPDATE',[data.target_location_id,companyId]);
      if (!targetRes.rowCount) throw new NotFoundException('La ubicación destino no existe.');
      const target=targetRes.rows[0];
      if (target.warehouse_id!==item.warehouse_id) throw new BadRequestException('Los movimientos de almacenamiento deben permanecer en la misma bodega.');
      if (target.status!=='active') throw new BadRequestException('No se puede ubicar mercancía en una ubicación bloqueada.');
      const status=data.target_status;
      const current=await client.query(`SELECT COALESCE(SUM(i.quantity),0) quantity,COALESCE(SUM(i.quantity*p.weight_kg),0) weight,
        COALESCE(SUM(i.quantity*p.volume_m3),0) volume,COALESCE(SUM(i.quantity/p.units_per_pallet),0) pallets,COALESCE(ARRAY_AGG(DISTINCT b.product_id) FILTER(WHERE i.quantity>0),'{}') product_ids
        FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id WHERE i.storage_location_id=$1`,[target.id]);
      const occupied=current.rows[0];
      const additionalQuantity=target.id===item.storage_location_id?0:data.quantity;
      if (target.capacity_units>0 && Number(occupied.quantity)+additionalQuantity>Number(target.capacity_units)) throw new BadRequestException('La ubicación no tiene capacidad suficiente en unidades.');
      if (target.capacity_weight_kg>0 && Number(occupied.weight)+additionalQuantity*Number(item.weight_kg)>Number(target.capacity_weight_kg)) throw new BadRequestException('La ubicación no tiene capacidad suficiente en peso.');
      if (target.capacity_volume_m3>0 && Number(occupied.volume)+additionalQuantity*Number(item.volume_m3)>Number(target.capacity_volume_m3)) throw new BadRequestException('La ubicación no tiene capacidad suficiente en volumen.');
      if (target.capacity_pallets>0 && Number(occupied.pallets)+additionalQuantity/Number(item.units_per_pallet)>Number(target.capacity_pallets)) throw new BadRequestException('La ubicación no tiene capacidad suficiente en pallets.');
      if (!target.allow_mixed_products && occupied.product_ids.length && !occupied.product_ids.includes(item.product_id)) throw new BadRequestException('Esta ubicación no permite mezclar productos.');
      if (item.is_hazardous && (!target.allows_hazardous || (target.allowed_hazard_classes.length && !target.allowed_hazard_classes.includes(item.hazard_class)))) throw new BadRequestException('La ubicación no admite esta clase de producto peligroso.');
      if (target.compatible_categories.length && !target.compatible_categories.includes(item.category)) throw new BadRequestException('La categoría del producto no es compatible con la ubicación.');
      const applicableRules=await client.query(`SELECT * FROM storage_rules WHERE company_id=$1 AND is_active AND (product_id=$2 OR (product_id IS NULL AND category=$3)) ORDER BY priority`,[companyId,item.product_id,item.category]);
      for (const rule of applicableRules.rows) {
        if (rule.required_location_type && target.location_type!==rule.required_location_type) throw new BadRequestException(`La regla «${rule.name}» exige una ubicación de tipo ${rule.required_location_type}.`);
        if (rule.incompatible_categories.length) {
          const conflict=await client.query(`SELECT 1 FROM inventory i JOIN product_batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id WHERE i.storage_location_id=$1 AND p.category=ANY($2) LIMIT 1`,[target.id,rule.incompatible_categories]);
          if (conflict.rowCount) throw new BadRequestException(`La regla «${rule.name}» detectó una categoría incompatible en destino.`);
        }
      }
      if (item.storage_location_id===target.id && item.stock_status===status) throw new BadRequestException('El inventario ya está en esa ubicación y estado.');
      await decrementInventory(client,item.id,Number(data.quantity));
      const upsert=await client.query(`INSERT INTO inventory(batch_id,warehouse_id,storage_location_id,stock_status,quantity,bin_location)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(batch_id,warehouse_id,storage_location_id,stock_status)
        DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,last_updated=CURRENT_TIMESTAMP RETURNING id`,[item.batch_id,item.warehouse_id,target.id,status,data.quantity,target.code]);
      await client.query(`INSERT INTO storage_movements(company_id,inventory_id,batch_id,product_id,warehouse_id,from_location_id,to_location_id,movement_type,quantity,from_status,to_status,reference,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[companyId,upsert.rows[0].id,item.batch_id,item.product_id,item.warehouse_id,item.storage_location_id,target.id,data.movement_type,data.quantity,item.stock_status,status,data.reference||null,data.notes||null,userId||null]);
      await client.query('COMMIT');
      return { success:true, inventory_id:upsert.rows[0].id, quantity:data.quantity };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async rules(companyId: string) {
    return (await this.db.query(`SELECT r.*,p.name AS product_name,l.code AS preferred_location_code FROM storage_rules r LEFT JOIN products p ON p.id=r.product_id LEFT JOIN storage_locations l ON l.id=r.preferred_location_id WHERE r.company_id=$1 ORDER BY r.priority,r.name`,[companyId])).rows;
  }
  async saveRule(companyId: string, data: any) {
    const result=await this.db.query(`INSERT INTO storage_rules(company_id,name,product_id,category,required_location_type,preferred_location_id,incompatible_categories,priority,is_active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[companyId,String(data.name).trim(),data.product_id||null,data.category||null,data.required_location_type||null,data.preferred_location_id||null,data.incompatible_categories||[],Number(data.priority||100),data.is_active!==false]);
    return result.rows[0];
  }
  async updateProductProfile(companyId: string,id: string,data: any) {
    const result=await this.db.query(`UPDATE products p SET weight_kg=$3,volume_m3=$4,units_per_pallet=$5,is_hazardous=$6,hazard_class=$7
      FROM companies c WHERE c.id=$1 AND p.company_id=$1 AND p.id=$2 RETURNING p.id,p.name,p.sku,p.weight_kg,p.volume_m3,p.units_per_pallet,p.is_hazardous,p.hazard_class`,[companyId,id,data.weight_kg,data.volume_m3,data.units_per_pallet,data.is_hazardous,data.hazard_class]);
    return result.rows[0]||null;
  }
}
