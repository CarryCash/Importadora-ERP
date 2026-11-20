import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const roundCurrency=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;

@Injectable()
export class QuotesRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(dto:any,companyId:string,userId:string,branchId:string|null,userRoles:string[]=[]){
    const {customer_id,items,valid_until,notes,discount=0,price_list_id=null}=dto;
    if(!companyId||!Array.isArray(items)||!items.length)throw new BadRequestException('La cotización requiere empresa y al menos un producto.');
    const canOverride=Array.isArray(userRoles)&&userRoles.some(role=>['admin','erp_admin'].includes(role));
    const client=await this.db.getPool().connect();
    try{
      await client.query('BEGIN');
      let customer:any=null;
      if(customer_id){const result=await client.query('SELECT id,is_active,customer_type FROM customers WHERE id=$1 AND company_id=$2',[customer_id,companyId]);if(!result.rowCount)throw new BadRequestException('El cliente no pertenece a esta empresa.');if(!result.rows[0].is_active)throw new BadRequestException('No se puede cotizar a un cliente inactivo.');customer=result.rows[0];}
      if(!Number.isFinite(Number(discount))||Number(discount)<0||Number(discount)>100)throw new BadRequestException('El descuento debe estar entre 0 y 100%.');
      let priceList:any=null;
      if(price_list_id){const result=await client.query(`SELECT l.* FROM product_price_lists l WHERE l.id=$1 AND l.company_id=$2 AND l.is_active AND l.approval_status='approved'
        AND (l.starts_at IS NULL OR l.starts_at<=CURRENT_DATE) AND (l.ends_at IS NULL OR l.ends_at>=CURRENT_DATE)
        AND (l.customer_id IS NULL OR l.customer_id=$3) AND (l.customer_segment IS NULL OR l.customer_segment=$4)
        AND (l.branch_id IS NULL OR l.branch_id=$5) FOR SHARE`,[price_list_id,companyId,customer_id||null,customer?.customer_type||null,branchId]);
        if(!result.rowCount)throw new BadRequestException('La lista no está aprobada/vigente o no corresponde al cliente y sucursal.');
        priceList=result.rows[0];if(priceList.currency!=='USD')throw new BadRequestException('La cotización requiere lista en USD; todavía no hay tipo de cambio aprobado para esta moneda.');
        if(!canOverride&&Number(discount)>Number(priceList.max_discount_percent))throw new BadRequestException('El descuento supera la política autorizada de la lista.');
      }else if(Number(discount)>0&&!canOverride)throw new BadRequestException('Selecciona una lista aprobada para aplicar un descuento.');

      const year=new Date().getFullYear();await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`quote-number-${companyId}-${year}`]);
      const countRes=await client.query('SELECT COUNT(*)::int count FROM quotes WHERE company_id=$1 AND EXTRACT(YEAR FROM created_at)=$2',[companyId,year]);
      const quoteNumber=`COT-${year}-${String(Number(countRes.rows[0].count)+1).padStart(6,'0')}`;
      const header=await client.query(`INSERT INTO quotes(quote_number,customer_id,user_id,valid_until,status,subtotal,discount,tax,total_amount,notes,company_id,branch_id,price_list_id,price_list_name_snapshot,price_list_currency_snapshot,price_exchange_rate_snapshot)
        VALUES($1,$2,$3,$4,'draft',0,0,0,0,$5,$6,$7,$8,$9,$10,1) RETURNING *`,[quoteNumber,customer_id||null,userId,valid_until||null,notes||null,companyId,branchId,priceList?.id||null,priceList?.name||null,priceList?.currency||'USD']);
      let subtotal=0,taxTotal=0;
      for(const item of items){const quantity=Number(item.quantity);if(!Number.isSafeInteger(quantity)||quantity<=0)throw new BadRequestException('Las cantidades de cotización deben ser enteros positivos.');
        const product=await client.query('SELECT id,name,sku,price,sale_price,iva_rate,is_active,archived_at FROM products WHERE id=$1 AND company_id=$2',[item.product_id,companyId]);if(!product.rowCount)throw new NotFoundException('Producto no encontrado para esta empresa.');if(!product.rows[0].is_active||product.rows[0].archived_at)throw new BadRequestException('No se puede cotizar un producto inactivo o archivado.');
        let rule:any=null;if(priceList){const found=await client.query(`SELECT * FROM product_price_rules WHERE company_id=$1 AND price_list_id=$2 AND product_id=$3 AND min_quantity<=$4 AND (starts_at IS NULL OR starts_at<=CURRENT_DATE) AND (ends_at IS NULL OR ends_at>=CURRENT_DATE) ORDER BY min_quantity DESC LIMIT 1`,[companyId,priceList.id,item.product_id,quantity]);rule=found.rows[0]||null;}
        const listUnitPrice=rule?Number(rule.unit_price):Number(product.rows[0].sale_price??product.rows[0].price??0);
        if(!Number.isFinite(listUnitPrice)||listUnitPrice<0)throw new BadRequestException(`Precio no válido para ${product.rows[0].name}.`);
        let lineDiscount=Number(rule?.discount_percent||0);const manualDiscount=Number(item.discount||0);if(!Number.isFinite(manualDiscount)||manualDiscount<0||manualDiscount>100)throw new BadRequestException('El descuento por línea debe estar entre 0 y 100%.');
        lineDiscount=100*(1-(1-lineDiscount/100)*(1-manualDiscount/100));const effective=100*(1-(1-lineDiscount/100)*(1-Number(discount)/100));if(!canOverride&&priceList&&effective>Number(priceList.max_discount_percent))throw new BadRequestException('El descuento combinado supera la política autorizada.');
        const lineSubtotal=roundCurrency(quantity*listUnitPrice*(1-lineDiscount/100));const taxRate=Number(product.rows[0].iva_rate??0);if(!Number.isFinite(taxRate)||taxRate<0||taxRate>15)throw new BadRequestException('La tarifa de IVA del producto no es válida.');const lineTax=roundCurrency(lineSubtotal*(1-Number(discount)/100)*taxRate/100);subtotal+=lineSubtotal;taxTotal+=lineTax;
        await client.query(`INSERT INTO quote_items(quote_id,product_id,quantity,unit_price,discount,total_amount,tax_rate,price_currency_snapshot,list_unit_price_snapshot)
          VALUES($1,$2,$3,$4,$5,$6,$7,'USD',$8)`,[header.rows[0].id,item.product_id,quantity,listUnitPrice,lineDiscount,lineSubtotal,taxRate,listUnitPrice]);
      }
      subtotal=roundCurrency(subtotal);taxTotal=roundCurrency(taxTotal);const discountAmount=roundCurrency(subtotal*Number(discount)/100);const total=roundCurrency(subtotal-discountAmount+taxTotal);
      const final=await client.query('UPDATE quotes SET subtotal=$2,discount=$3,tax=$4,total_amount=$5 WHERE id=$1 RETURNING *',[header.rows[0].id,subtotal,discountAmount,taxTotal,total]);
      await client.query('COMMIT');return final.rows[0];
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async findAll(companyId:string){return (await this.db.query(`SELECT q.*,c.name customer_name FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id AND c.company_id=q.company_id WHERE q.company_id=$1 ORDER BY q.created_at DESC`,[companyId])).rows;}
}
