import { BadRequestException, Injectable } from '@nestjs/common';
import { CustomersRepository } from './customers.repository';

function validEcuadorIdentification(type:string,value:string){
  if(type==='PASAPORTE'||type==='OTHER')return Boolean(value.trim());
  if(!/^\d+$/.test(value))return false;
  const checkCedula=(cedula:string)=>{if(cedula.length!==10)return false;const province=Number(cedula.slice(0,2)),third=Number(cedula[2]);if(province<1||province>24||third>5)return false;const sum=[2,1,2,1,2,1,2,1,2].reduce((total,coefficient,index)=>{let digit=Number(cedula[index])*coefficient;if(digit>=10)digit-=9;return total+digit;},0);return ((10-sum%10)%10)===Number(cedula[9]);};
  if(type==='CEDULA')return checkCedula(value);
  if(type!=='RUC'||value.length!==13||!value.endsWith('001'))return false;
  const province=Number(value.slice(0,2)),third=Number(value[2]);if(province<1||province>24)return false;
  if(third<6)return checkCedula(value.slice(0,10));
  const weights=third===6?[3,2,7,6,5,4,3,2]:third===9?[4,3,2,7,6,5,4,3,2]:null;if(!weights)return false;
  const verifierIndex=third===6?8:9,verifier=Number(value[verifierIndex]),sum=weights.reduce((total,weight,index)=>total+Number(value[index])*weight,0);return ((11-sum%11)%11)===verifier;
}

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}
  
  async create(companyId:string,userId:string,dto: any) {
    if(!String(dto.name||'').trim())throw new BadRequestException('Indica el nombre o razón social del cliente.');
    if(!['natural','legal'].includes(dto.party_type||'natural'))throw new BadRequestException('Selecciona persona natural o jurídica.');
    if(!['RUC','CEDULA','PASAPORTE','OTHER'].includes(String(dto.identification_type||'').toUpperCase()))throw new BadRequestException('Tipo de identificación no válido.');
    if(dto.identification_number&&!validEcuadorIdentification(String(dto.identification_type||'').toUpperCase(),String(dto.identification_number).trim()))throw new BadRequestException('La identificación no pasa la validación de formato y dígito verificador.');
    const creditLimit=Number(dto.credit_limit||0),discount=Number(dto.default_discount||0);
    if(!Number.isFinite(creditLimit)||creditLimit<0||!Number.isFinite(discount)||discount<0||discount>100)throw new BadRequestException('Cupo o descuento no válido.');
    if(creditLimit>0||Number(dto.payment_terms)>0)throw new BadRequestException('El crédito inicial es cero; registra el cliente y solicita el cupo desde la gestión de crédito.');
    return this.repository.create(companyId,userId,dto);
  }

  async findAll(companyId:string,filters:any) {
    return this.repository.findAll(companyId,filters);
  }

  async findOne(companyId:string,id: string) {
    return this.repository.findById(companyId,id);
  }

  async update(companyId:string,userId:string,id: string, dto: any) {
    if(dto.credit_limit!==undefined||dto.payment_terms!==undefined)throw new BadRequestException('Los cambios de cupo y plazo se guardan en la gestión de crédito.');
    const type=String(dto.identification_type||'OTHER').toUpperCase();if(dto.identification_number&&!validEcuadorIdentification(type,String(dto.identification_number).trim()))throw new BadRequestException('La identificación no pasa la validación de formato y dígito verificador.');
    return this.repository.update(companyId,userId,id, dto);
  }

  async remove(companyId:string,userId:string,id: string) {
    return this.repository.delete(companyId,userId,id);
  }

  async getStatement(companyId:string,id: string) {
    return this.repository.getStatement(companyId,id);
  }

  async changeCredit(companyId:string,userId:string,id:string,dto:any){return this.repository.changeCredit(companyId,userId,id,dto);}
  async requestCredit(companyId:string,userId:string,id:string,dto:any){return this.repository.requestCredit(companyId,userId,id,dto);}
  async reviewCreditRequest(companyId:string,userId:string,id:string,requestId:string,dto:any){return this.repository.reviewCreditRequest(companyId,userId,id,requestId,dto);}
  async createContact(companyId:string,userId:string,id:string,dto:any){if(!String(dto.full_name||'').trim())throw new BadRequestException('El contacto requiere un nombre.');return this.repository.createContact(companyId,userId,id,dto);}
  async createAddress(companyId:string,userId:string,id:string,dto:any){if(!['billing','delivery','main','branch','other'].includes(dto.address_type||'other'))throw new BadRequestException('Tipo de dirección no válido.');return this.repository.createAddress(companyId,userId,id,dto);}
  async updateContact(companyId:string,userId:string,id:string,contactId:string,dto:any){if(dto.full_name!==undefined&&!String(dto.full_name).trim())throw new BadRequestException('El contacto requiere un nombre.');return this.repository.updateContact(companyId,userId,id,contactId,dto);}
  async updateAddress(companyId:string,userId:string,id:string,addressId:string,dto:any){if(dto.address_type!==undefined&&!['billing','delivery','main','branch','other'].includes(dto.address_type))throw new BadRequestException('Tipo de dirección no válido.');return this.repository.updateAddress(companyId,userId,id,addressId,dto);}
  async deactivateRelationship(companyId:string,userId:string,id:string,type:'contact'|'address',recordId:string){return this.repository.deactivateRelationship(companyId,userId,id,type,recordId);}
  async getAnalytics(companyId:string){return this.repository.getAnalytics(companyId);}
  async exportCsv(companyId:string){return this.repository.exportCsv(companyId);}
  async importCsv(companyId:string,userId:string,csv:string){if(!csv||csv.length>1_500_000)throw new BadRequestException('El CSV está vacío o supera 1.5 MB.');const rows=this.repository.parseCsv(csv);if(rows.length>5000)throw new BadRequestException('La importación admite hasta 5.000 clientes por archivo.');const imported:any[]=[],errors:any[]=[];for(let index=0;index<rows.length;index++){const row=rows[index];try{if(['false','0','inactive','inactivo'].includes(String(row.is_active||'').toLowerCase()))throw new BadRequestException('La importación agrega clientes activos; no reactiva registros inactivos.');const created=await this.create(companyId,userId,{...row,party_type:row.party_type||'natural',identification_type:String(row.identification_type||'OTHER').toUpperCase(),credit_limit:0,payment_terms:0,default_discount:Number(row.default_discount)||0});imported.push({row:index+2,code:created.code});}catch(e){errors.push({row:index+2,message:e instanceof Error?e.message:'Error de validación.'});}}return {imported:imported.length,failed:errors.length,errors:errors.slice(0,100),credit_note:'Los cupos y plazos del CSV no se aplican; tramítalos mediante solicitud de crédito.'};}
}
