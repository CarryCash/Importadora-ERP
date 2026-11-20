import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ProductsRepository } from './products.repository';

const identifierTypes=['ean8','upca','ean13','gtin14','internal','manufacturer_reference','supplier_reference','previous_code','other'];
const relationTables:Record<string,string>={category_id:'product_categories',brand_id:'product_brands',manufacturer_id:'product_manufacturers',model_id:'product_models',family_id:'product_families'};

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository,private readonly db:DatabaseService) {}

  async create(companyId:string,userId:string,dto:any) {
    this.validateProduct(dto);
    const payload=await this.normalizeRelations(companyId,dto);
    payload.identifiers=this.normalizeIdentifiers(dto);
    payload.barcode=payload.identifiers.find((item:any)=>item.is_primary&&['ean8','upca','ean13','gtin14'].includes(item.type))?.value||dto.barcode||null;
    payload.attribute_values=await this.validateAttributes(companyId,payload.category_id,payload.attribute_values||dto.attribute_values||[]);
    await this.assertIdentifiersAvailable(companyId,payload.identifiers);
    try{return await this.productsRepository.create(companyId,userId,payload);}catch(error:any){if(error?.code==='23505')throw new ConflictException('El SKU o identificador ya está registrado en esta empresa.');throw error;}
  }

  async bulkImport(companyId:string,userId:string,rows:any[]) {
    if(!Array.isArray(rows)||rows.length===0)throw new BadRequestException('El archivo no contiene filas para importar.');
    if(rows.length>1000)throw new BadRequestException('Importa hasta 1.000 filas por archivo. Divide los archivos más grandes en lotes.');
    const errors:{row:number;name:string;message:string}[]=[];let created=0;
    for(let index=0;index<rows.length;index++){
      const row=rows[index];
      try{await this.create(companyId,userId,row);created++;}
      catch(error:any){errors.push({row:index+2,name:String(row?.name||''),message:Array.isArray(error?.response?.message)?error.response.message.join(', '):String(error?.response?.message||error?.message||'No se pudo importar.')});}
    }
    return {created,failed:errors.length,errors};
  }

  async update(companyId:string,userId:string,id:string,dto:any) {
    const current=await this.productsRepository.findById(companyId,id);if(!current)throw new NotFoundException('Producto no encontrado.');if(current.archived_at)throw new ConflictException('Restaura el producto antes de editarlo.');
    this.validateProduct({...current,...dto},true);
    const payload=await this.normalizeRelations(companyId,{...current,...dto});
    if(dto.identifiers!==undefined){payload.identifiers=this.normalizeIdentifiers(dto);payload.barcode=payload.identifiers.find((item:any)=>item.is_primary&&['ean8','upca','ean13','gtin14'].includes(item.type))?.value||null;await this.assertIdentifiersAvailable(companyId,payload.identifiers,id);}
    if(dto.attribute_values!==undefined)payload.attribute_values=await this.validateAttributes(companyId,payload.category_id,dto.attribute_values);
    try{return await this.productsRepository.update(companyId,userId,id,payload);}catch(error:any){if(error?.code==='23505')throw new ConflictException('El SKU o identificador ya está registrado en esta empresa.');throw error;}
  }

  async updateTaxRate(companyId:string,userId:string,id:string,rate:number) {this.validateTaxRate(rate);const row=await this.productsRepository.updateTaxRate(companyId,userId,id,rate);if(!row)throw new NotFoundException('Producto no encontrado.');return row;}
  async updateStatus(companyId:string,userId:string,id:string,isActive:boolean,reason?:string) {if(typeof isActive!=='boolean')throw new BadRequestException('Indica el estado activo como valor booleano.');const row=await this.productsRepository.updateStatus(companyId,userId,id,isActive,reason);if(!row)throw new NotFoundException('Producto no encontrado o archivado.');return row;}
  async archive(companyId:string,userId:string,id:string,reason:string){if(!String(reason||'').trim())throw new BadRequestException('El motivo de archivo es obligatorio.');const row=await this.productsRepository.archive(companyId,userId,id,String(reason).trim());if(!row)throw new NotFoundException('Producto no encontrado o ya archivado.');return row;}
  async restore(companyId:string,userId:string,id:string,reason:string){if(!String(reason||'').trim())throw new BadRequestException('Indica un motivo para restaurar el producto.');const row=await this.productsRepository.restore(companyId,userId,id,String(reason).trim());if(!row)throw new NotFoundException('Producto archivado no encontrado.');return row;}
  async findAll(companyId:string,filters:any={}){return this.productsRepository.findAll(companyId,filters);}
  async findOne(companyId:string,id:string){const row=await this.productsRepository.findById(companyId,id);if(!row)throw new NotFoundException('Producto no encontrado.');return row;}
  async identifiers(companyId:string,id:string){await this.findOne(companyId,id);return this.productsRepository.identifiers(companyId,id);}
  async attributeValues(companyId:string,id:string){await this.findOne(companyId,id);return this.productsRepository.attributeValues(companyId,id);}
  async history(companyId:string,id:string){await this.findOne(companyId,id);return this.productsRepository.history(companyId,id);}

  async categoryAttributes(companyId:string,categoryId:string){
    const result=await this.db.query(`WITH RECURSIVE ancestors AS (
      SELECT id,parent_id,0 depth FROM product_categories WHERE id=$1 AND company_id=$2
      UNION ALL SELECT c.id,c.parent_id,a.depth+1 FROM product_categories c JOIN ancestors a ON a.parent_id=c.id WHERE c.company_id=$2
      ) SELECT DISTINCT ON(d.code) d.*,a.depth FROM ancestors a JOIN product_attribute_definitions d ON d.category_id=a.id AND d.company_id=$2 AND d.is_active ORDER BY d.code,a.depth ASC,d.sort_order,d.name`,[categoryId,companyId]);
    if(!result.rows.length){const exists=await this.db.query('SELECT 1 FROM product_categories WHERE id=$1 AND company_id=$2',[categoryId,companyId]);if(!exists.rowCount)throw new NotFoundException('Categoría no encontrada.');}
    return result.rows;
  }

  async createCategoryAttribute(companyId:string,categoryId:string,body:any){
    const category=await this.db.query('SELECT id FROM product_categories WHERE id=$1 AND company_id=$2',[categoryId,companyId]);if(!category.rowCount)throw new NotFoundException('Categoría no encontrada.');
    const code=String(body.code||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'_');const name=String(body.name||'').trim();const type=String(body.data_type||'text');
    if(!code||!name||!['text','number','decimal','boolean','date','select','multiselect'].includes(type))throw new BadRequestException('Nombre, código y tipo de atributo son obligatorios.');
    if(['select','multiselect'].includes(type)&&(!Array.isArray(body.options)||!body.options.length))throw new BadRequestException('Los atributos de selección requieren opciones.');
    try{return (await this.db.query(`INSERT INTO product_attribute_definitions(company_id,category_id,code,name,data_type,unit,is_required,options,sort_order)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,[companyId,categoryId,code,name,type,body.unit||null,Boolean(body.is_required),JSON.stringify(body.options||[]),Number(body.sort_order||0)])).rows[0];}catch(e:any){if(e?.code==='23505')throw new ConflictException('Ya existe un atributo con ese código en la categoría.');throw e;}
  }

  async updateCategoryAttribute(companyId:string,categoryId:string,definitionId:string,body:any){
    const fields=['code','name','data_type','unit','is_required','options','sort_order','is_active'];const keys=fields.filter(k=>body[k]!==undefined);if(!keys.length)throw new BadRequestException('No hay cambios para guardar.');
    const values=keys.map(k=>k==='code'?String(body[k]).trim().toLowerCase().replace(/[^a-z0-9_-]/g,'_'):k==='options'?JSON.stringify(body[k]):body[k]);
    const setters=keys.map((k,i)=>`${k}=$${i+4}${k==='options'?'::jsonb':''}`);
    const row=await this.db.query(`UPDATE product_attribute_definitions SET ${setters.join(',')} WHERE company_id=$1 AND category_id=$2 AND id=$3 RETURNING *`,[companyId,categoryId,definitionId,...values]);if(!row.rowCount)throw new NotFoundException('Atributo no encontrado.');return row.rows[0];
  }

  private validateProduct(dto:any,partial=false){
    if(!partial&&!String(dto.name||'').trim())throw new BadRequestException('El nombre del producto es obligatorio.');
    if(dto.name!==undefined&&String(dto.name).trim().length>100)throw new BadRequestException('El nombre admite hasta 100 caracteres.');
    this.validateTaxRate(dto.iva_rate??13);
    for(const field of ['price','sale_price','cost_price','wholesale_price','min_stock','lead_time_days'])if(dto[field]!==undefined&&dto[field]!==null&&(!Number.isFinite(Number(dto[field]))||Number(dto[field])<0))throw new BadRequestException(`${field} debe ser un valor numérico no negativo.`);
    if(dto.product_type&&!['physical','service','combo','sample'].includes(dto.product_type)&&!partial)throw new BadRequestException('Tipo de producto no válido.');
    if(dto.sku&&String(dto.sku).trim().length>50)throw new BadRequestException('El SKU admite hasta 50 caracteres.');
  }
  private validateTaxRate(rate:number){if(!Number.isFinite(Number(rate))||Number(rate)<0||Number(rate)>15)throw new BadRequestException('La tarifa IVA debe estar entre 0% y 15%.');}
  private isValidGtin(value:string){if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value))return false;const digits=[...value].map(Number),check=digits.pop()!;const sum=digits.reverse().reduce((total,digit,index)=>total+digit*(index%2===0?3:1),0);return (10-sum%10)%10===check;}
  private normalizeIdentifiers(dto:any){
    const list:any[]=Array.isArray(dto.identifiers)?dto.identifiers:[];
    if(!list.length&&dto.barcode)list.push({type:this.typeFromGtin(String(dto.barcode)),value:dto.barcode,is_primary:true});
    if(list.length>30)throw new BadRequestException('Se admiten hasta 30 identificadores por producto.');
    let primary=0;const seen=new Set<string>();
    const normalizedItems=list.map(item=>{const type=String(item.type||item.identifier_type||'').toLowerCase();const value=String(item.value||'').trim();if(!value)return null;if(!identifierTypes.includes(type))throw new BadRequestException(`Tipo de identificador no válido: ${type}.`);if(item.is_primary)primary++;const normalized=value.normalize('NFKC').toUpperCase().replace(/[\s-]/g,'');const duplicateKey=`${type}:${normalized}`;if(seen.has(duplicateKey))throw new ConflictException('Hay identificadores duplicados en el formulario.');seen.add(duplicateKey);const expected:Record<string,number>={ean8:8,upca:12,ean13:13,gtin14:14};if(expected[type]&&(!this.isValidGtin(normalized)||normalized.length!==expected[type]))throw new BadRequestException(`${type.toUpperCase()} no tiene formato o dígito de control válido.`);if(value.length>160)throw new BadRequestException('El identificador admite hasta 160 caracteres.');return {type,value,is_primary:Boolean(item.is_primary)};}).filter(Boolean) as any[];
    if(primary>1)throw new BadRequestException('Solo puede existir un código de barras principal.');
    return normalizedItems;
  }
  private typeFromGtin(value:string){const normalized=value.normalize('NFKC').replace(/[\s-]/g,'');return ({8:'ean8',12:'upca',13:'ean13',14:'gtin14'} as Record<number,string>)[normalized.length]||'other';}
  private async assertIdentifiersAvailable(companyId:string,items:any[],excludeId?:string){for(const item of items){const normalized=item.value.normalize('NFKC').toUpperCase().replace(/[\s-]/g,'');if(await this.productsRepository.barcodeExists(companyId,normalized,excludeId))throw new ConflictException(`El identificador ${item.value} ya está registrado.`);}}
  private async normalizeRelations(companyId:string,dto:any){
    const payload={...dto};
    for(const [field,table] of Object.entries(relationTables)){const id=payload[field];if(!id){payload[field]=null;continue;}const result=await this.db.query(`SELECT id,name${field==='model_id'?',brand_id':''} FROM ${table} WHERE id=$1 AND company_id=$2 AND is_active=true`,[id,companyId]);if(!result.rowCount)throw new BadRequestException(`La relación ${field} no existe o está inactiva en esta empresa.`);if(field==='category_id')payload.category=result.rows[0].name;if(field==='brand_id')payload.brand=result.rows[0].name;if(field==='model_id'&&payload.brand_id&&result.rows[0].brand_id!==payload.brand_id)throw new BadRequestException('El modelo no pertenece a la marca seleccionada.');}
    if(payload.parent_product_id){const parent=await this.db.query('SELECT id FROM products WHERE id=$1 AND company_id=$2 AND archived_at IS NULL',[payload.parent_product_id,companyId]);if(!parent.rowCount)throw new BadRequestException('El producto padre no pertenece a esta empresa.');}
    return payload;
  }
  private async validateAttributes(companyId:string,categoryId:string|null,values:any[]){
    if(!Array.isArray(values))throw new BadRequestException('Los atributos deben enviarse como una lista.');
    if(!categoryId&&values.length)throw new BadRequestException('Selecciona una categoría antes de asignar atributos.');
    if(!categoryId)return [];
    const definitions=await this.categoryAttributes(companyId,categoryId);const byId=new Map(definitions.map(d=>[d.id,d]));const input=new Map<string,any>();
    for(const item of values){if(input.has(item.definition_id))throw new BadRequestException('Un atributo aparece más de una vez.');input.set(item.definition_id,item.value);}
    for(const definition of definitions){const value=input.get(definition.id);if(definition.is_required&&(value===undefined||value===null||value===''))throw new BadRequestException(`Completa el atributo obligatorio «${definition.name}».`);}
    return values.filter(v=>v.value!==undefined&&v.value!==null&&v.value!=='').map(item=>{const definition=byId.get(item.definition_id);if(!definition)throw new BadRequestException('Hay un atributo que no pertenece a la categoría del producto.');let value=item.value;const options=Array.isArray(definition.options)?definition.options:[];
      if(['number','decimal'].includes(definition.data_type)){value=Number(value);if(!Number.isFinite(value)||(definition.data_type==='number'&&!Number.isInteger(value)))throw new BadRequestException(`El atributo «${definition.name}» debe ser numérico.`);}
      else if(definition.data_type==='boolean'){if(typeof value!=='boolean')throw new BadRequestException(`El atributo «${definition.name}» debe ser verdadero o falso.`);}
      else if(definition.data_type==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))||Number.isNaN(Date.parse(`${value}T00:00:00Z`)))throw new BadRequestException(`El atributo «${definition.name}» requiere una fecha válida.`);}
      else if(definition.data_type==='select'&&!options.includes(value))throw new BadRequestException(`Selecciona una opción válida para «${definition.name}».`);
      else if(definition.data_type==='multiselect'&&(!Array.isArray(value)||value.some((item:any)=>!options.includes(item))))throw new BadRequestException(`Selecciona opciones válidas para «${definition.name}».`);
      else if(['text','select'].includes(definition.data_type))value=String(value);
      return {definition_id:item.definition_id,value};});
  }
}
