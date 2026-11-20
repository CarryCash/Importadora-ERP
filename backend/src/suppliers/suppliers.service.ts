import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SuppliersRepository } from './suppliers.repository';

@Injectable()
export class SuppliersService {
  constructor(private readonly repository: SuppliersRepository) {}

  dashboard(companyId: string) { return this.repository.dashboard(companyId); }
  findAll(companyId: string, filters: any) { return this.repository.findAll(companyId, filters); }

  async findOne(companyId: string, id: string) {
    const supplier = await this.repository.findById(companyId, id);
    if (!supplier) throw new NotFoundException('Proveedor no encontrado en esta empresa.');
    return supplier;
  }

  async profile360(companyId: string, id: string) {
    const profile = await this.repository.profile360(companyId, id);
    if (!profile) throw new NotFoundException('Proveedor no encontrado en esta empresa.');
    return profile;
  }

  categories(companyId: string, supplierType?: 'national' | 'international') {
    return this.repository.categories(companyId, supplierType);
  }

  async createCategory(companyId: string, userId: string, data: any) {
    this.assertType(data.supplier_type);
    if (!String(data.name || '').trim()) throw new BadRequestException('Indica el nombre de la categoría.');
    return this.repository.createCategory(companyId, userId, data);
  }

  approvalPolicies(companyId: string, supplierType?: 'national'|'international') { return this.repository.approvalPolicies(companyId,supplierType); }

  async saveApprovalPolicy(companyId: string, userId: string, data: any) {
    this.assertType(data.supplier_type);
    if (!String(data.name||'').trim()) throw new BadRequestException('Indica el nombre de la política.');
    if (data.requires_approval !== false && (!Array.isArray(data.approval_steps) || !data.approval_steps.length)) throw new BadRequestException('Configura al menos un paso de aprobación o desactiva la aprobación obligatoria.');
    if (data.approval_steps && (!Array.isArray(data.approval_steps) || data.approval_steps.some((step:any)=>!Array.isArray(step?.roles)||!step.roles.length))) throw new BadRequestException('Cada paso requiere al menos un rol aprobador.');
    const allowedRiskLevels=['low','medium','high','critical'];
    if(data.conditions?.credit_risk_levels?.some((level:string)=>!allowedRiskLevels.includes(level)))throw new BadRequestException('Los niveles de riesgo para crédito no son válidos.');
    return this.repository.saveApprovalPolicy(companyId,userId,data);
  }

  evaluationPolicies(companyId:string){return this.repository.evaluationPolicies(companyId);}

  async saveEvaluationPolicy(companyId:string,userId:string,data:any){
    if(!String(data.name||'').trim())throw new BadRequestException('Indica el nombre del modelo de evaluación.');
    const expected=['quality','delivery','price','documents','communication'];const weights=data.criteria_weights||{};
    if(expected.some(key=>!Number.isFinite(Number(weights[key]))||Number(weights[key])<0)||Math.abs(expected.reduce((sum,key)=>sum+Number(weights[key]||0),0)-100)>0.001)throw new BadRequestException('Configura los cinco criterios y asegúrate de que sus ponderaciones sumen 100%.');
    if(!Number.isInteger(Number(data.minimum_confidence_operations))||Number(data.minimum_confidence_operations)<1)throw new BadRequestException('El volumen mínimo de operaciones debe ser un entero mayor a cero.');
    return this.repository.saveEvaluationPolicy(companyId,userId,data);
  }

  evaluations(companyId:string,supplierId?:string){return this.repository.evaluations(companyId,supplierId);}

  async createEvaluation(companyId:string,userId:string,data:any){
    if(!data.supplier_id)throw new BadRequestException('Selecciona un proveedor.');
    const keys=['quality','delivery','price','documents','communication'];const scores=data.criteria_scores||{};
    if(keys.some(key=>!Number.isFinite(Number(scores[key]))||Number(scores[key])<0||Number(scores[key])>100))throw new BadRequestException('Cada criterio debe tener una calificación entre 0 y 100.');
    if(!data.period_start||!data.period_end||new Date(data.period_end)<new Date(data.period_start))throw new BadRequestException('Indica un período de evaluación válido.');
    if(!Number.isInteger(Number(data.operation_count))||Number(data.operation_count)<0)throw new BadRequestException('Indica un volumen de operaciones válido.');
    if(!['low','medium','high','critical'].includes(data.risk_level||'low'))throw new BadRequestException('Selecciona un nivel de riesgo válido.');
    const result=await this.repository.createEvaluation(companyId,userId,data.supplier_id,data);if(!result)throw new NotFoundException('Proveedor no encontrado en esta empresa.');return result;
  }

  async riskOverview(companyId:string,supplierId:string){const result=await this.repository.riskOverview(companyId,supplierId);if(!result)throw new NotFoundException('Proveedor no encontrado en esta empresa.');return result;}

  async bankAccounts(companyId:string,userId:string,supplierId:string){const result=await this.repository.bankAccounts(companyId,userId,supplierId);if(!result)throw new NotFoundException('Proveedor no encontrado.');return result;}

  async saveDocument(companyId:string,userId:string,supplierId:string,file:any,data:any){
    if(!file?.buffer?.length)throw new BadRequestException('Selecciona un archivo para cargar.');
    const mime=String(file.mimetype||'').toLowerCase();const b=file.buffer as Buffer;
    const valid=mime==='application/pdf'&&b.subarray(0,5).toString()==='%PDF-'||mime==='image/jpeg'&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff||mime==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||mime==='image/webp'&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'||['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime)&&b.subarray(0,2).toString()==='PK'||mime==='text/plain'&&!b.includes(0);
    if(!valid)throw new BadRequestException('El contenido del archivo no coincide con un tipo permitido (PDF, imagen, DOCX, XLSX o TXT).');
    const result=await this.repository.saveDocument(companyId,userId,supplierId,file,data);if(!result)throw new NotFoundException('Proveedor no encontrado en esta empresa.');return result;
  }

  async documentDownload(companyId:string,userId:string,supplierId:string,documentId:string){const result=await this.repository.documentDownload(companyId,userId,supplierId,documentId);if(!result)throw new NotFoundException('Documento no encontrado o ya no disponible.');return result;}

  async activateSupplier(companyId: string, userId: string, supplierId: string) {
    const result:any=await this.repository.activateSupplier(companyId,userId,supplierId);
    if(result?.error==='not_found')throw new NotFoundException('Proveedor no encontrado en esta empresa.');
    if(result?.error==='not_approved')throw new BadRequestException('Solo se puede activar un proveedor con aprobación completada.');
    if(result?.error==='approval_record_missing')throw new BadRequestException('No existe un registro de aprobación asociado al proveedor.');
    return result;
  }

  async requestUnlock(companyId:string,userId:string,supplierId:string){const result:any=await this.repository.requestUnlock(companyId,userId,supplierId);if(result?.error==='not_found')throw new NotFoundException('Proveedor no encontrado en esta empresa.');if(result?.error==='not_restricted')throw new BadRequestException('El proveedor no está suspendido ni bloqueado.');if(result?.error==='change_already_pending')throw new BadRequestException('Ya existe una solicitud pendiente para este proveedor.');return result;}

  async create(companyId: string, userId: string, supplier: any) {
    this.assertType(supplier.supplier_type);
    if (!String(supplier.name || '').trim()) throw new BadRequestException('El nombre del proveedor es obligatorio.');
    const profile = supplier.supplier_type === 'national' ? supplier.national_profile : supplier.international_profile;
    if(profile?.account_number&&!await this.repository.hasPermission(companyId,userId,'suppliers.bank.manage'))throw new ForbiddenException('No tienes autorización para registrar datos bancarios de proveedores.');
    if (profile?.account_number && (!String(profile.bank_name || '').trim() || !String(profile.account_holder || '').trim())) {
      throw new BadRequestException('Completa el banco y el titular para guardar la cuenta bancaria protegida.');
    }
    if (supplier.supplier_type === 'national' && supplier.tax_id && !/^\d{13}$/.test(String(supplier.tax_id).replace(/\D/g, ''))) {
      throw new BadRequestException('El RUC ecuatoriano debe tener 13 dígitos.');
    }
    if (supplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(supplier.email))) throw new BadRequestException('El correo del proveedor no tiene un formato válido.');
    return this.repository.create(companyId, userId, supplier);
  }

  async update(companyId: string, userId: string, id: string, supplier: any) {
    if (supplier.supplier_type !== undefined) this.assertType(supplier.supplier_type);
    if (supplier.supplier_type && (await this.repository.findById(companyId, id))?.supplier_type !== supplier.supplier_type) {
      throw new BadRequestException('El tipo de proveedor no se puede cambiar después del registro.');
    }
    const profile=supplier.national_profile||supplier.international_profile;
    if(profile?.account_number&&!await this.repository.hasPermission(companyId,userId,'suppliers.bank.manage'))throw new ForbiddenException('No tienes autorización para modificar datos bancarios de proveedores.');
    if(profile?.account_number&&(!String(profile.bank_name||'').trim()||!String(profile.account_holder||'').trim()))throw new BadRequestException('Completa el banco y el titular para solicitar el cambio protegido de cuenta.');
    const updated = await this.repository.update(companyId, userId, id, supplier);
    if (!updated) throw new NotFoundException('Proveedor no encontrado en esta empresa.');
    if((updated as any).error==='change_already_pending')throw new BadRequestException('Ya existe una solicitud pendiente para este proveedor.');
    return updated;
  }

  approvals(companyId: string, status?: string) { return this.repository.approvals(companyId, status); }

  async reviewApproval(companyId: string, userId: string, id: string, decision: string, reason?: string, roles: string[] = [], reviewedDocuments: string[] = []) {
    if (!['approved','rejected','observed'].includes(decision)) throw new BadRequestException('Selecciona aprobar, observar o rechazar.');
    if (!reason?.trim()) throw new BadRequestException('Indica el comentario o motivo de la decisión.');
    const result = await this.repository.reviewApproval(companyId, userId, id, decision as 'approved'|'rejected'|'observed', reason, roles, reviewedDocuments);
    if (!result) throw new NotFoundException('La solicitud ya no está pendiente o no pertenece a esta empresa.');
    if ((result as any).error === 'self_approval') throw new BadRequestException('Quien registra un proveedor no puede aprobar su propia solicitud.');
    if ((result as any).error === 'rejection_reason_required') throw new BadRequestException('Indica el motivo del rechazo.');
    if ((result as any).error === 'observation_reason_required') throw new BadRequestException('Indica qué información o documento debe corregirse.');
    if ((result as any).error === 'role_not_allowed') throw new BadRequestException('Tu rol no corresponde al paso de aprobación actual.');
    if ((result as any).error === 'stale_version') throw new BadRequestException('La ficha cambió después de enviarse. Solicita una nueva revisión de la versión actual.');
    if ((result as any).error === 'invalid_reviewed_documents') throw new BadRequestException('Uno de los documentos seleccionados no pertenece a este proveedor.');
    if ((result as any).error === 'distinct_approver_required') throw new BadRequestException('La política exige que cada aprobación bancaria la realice una persona distinta.');
    if ((result as any).error === 'change_already_pending') throw new BadRequestException('Ya existe una solicitud de cambio pendiente para este proveedor.');
    return result;
  }

  private assertType(value: string) {
    if (!['national','international'].includes(value)) throw new BadRequestException('Selecciona proveedor nacional o internacional.');
  }
}
