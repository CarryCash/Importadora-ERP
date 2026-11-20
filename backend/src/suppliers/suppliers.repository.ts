import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DatabaseService } from '../database/database.service';

type SupplierFilters = { type?: 'national' | 'international'; query?: string; status?: string };

@Injectable()
export class SuppliersRepository {
  constructor(private readonly db: DatabaseService) {}

  async hasPermission(companyId:string,userId:string,permission:string){return Boolean((await this.db.query(`SELECT 1 FROM company_user_roles ur JOIN role_permissions rp ON rp.company_id=ur.company_id AND rp.role=ur.role_key WHERE ur.company_id=$1 AND ur.user_id=$2 AND rp.permission_key=$3 AND rp.allowed=true LIMIT 1`,[companyId,userId,permission])).rowCount);}

  private encryptBankAccount(value: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('No está configurada la clave de cifrado de cuentas bancarias.');
    const key = createHash('sha256').update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
  }

  private decryptBankAccount(value: string) {
    const secret=process.env.JWT_SECRET;if(!secret)throw new Error('No está configurada la clave de cifrado de cuentas bancarias.');
    const [ivHex,tagHex,cipherHex]=value.split('.');const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(ivHex,'hex'));decipher.setAuthTag(Buffer.from(tagHex,'hex'));return Buffer.concat([decipher.update(Buffer.from(cipherHex,'hex')),decipher.final()]).toString('utf8');
  }

  async bankAccounts(companyId:string,userId:string,supplierId:string){
    if(!await this.findById(companyId,supplierId))return null;
    const result=await this.db.query(`SELECT id,bank_name,account_holder,account_number_ciphertext,account_last_four,account_type,currency,country_code,verification_status,is_active,verified_at,created_at FROM supplier_bank_accounts WHERE company_id=$1 AND supplier_id=$2 ORDER BY is_active DESC,created_at DESC`,[companyId,supplierId]);
    await this.db.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,notes,after_values) VALUES($1,$2,'bank_details_viewed',$3,'Consulta autorizada de datos bancarios',jsonb_build_object('account_count',$4::int))`,[companyId,supplierId,userId,result.rowCount]);
    return result.rows.map(row=>({...row,account_number:this.decryptBankAccount(row.account_number_ciphertext),account_number_ciphertext:undefined}));
  }

  async saveDocument(companyId:string,userId:string,supplierId:string,file:any,data:any){
    const supplier=await this.findById(companyId,supplierId);if(!supplier)return null;
    const cleanName=String(file.originalname||'documento').replace(/[\\/\0-\x1f]/g,'_').slice(0,240);const storageKey=`${randomBytes(24).toString('hex')}.blob`;const checksum=createHash('sha256').update(file.buffer).digest('hex');const directory=join(process.cwd(),'private_uploads','suppliers');mkdirSync(directory,{recursive:true,mode:0o700});writeFileSync(join(directory,storageKey),file.buffer,{flag:'wx',mode:0o600});
    try{const saved=(await this.db.query(`INSERT INTO supplier_documents(company_id,supplier_id,document_type,document_number,file_url,original_filename,mime_type,expires_at,status,notes,uploaded_by,storage_key,checksum_sha256,file_size) VALUES($1,$2,$3,$4,NULL,$5,$6,$7,'pending',$8,$9,$10,$11,$12) RETURNING id,document_type,document_number,original_filename,mime_type,expires_at,status,notes,uploaded_by,created_at,checksum_sha256,file_size`,[companyId,supplierId,data.document_type||'supporting',data.document_number||null,cleanName,file.mimetype,data.expires_at||null,data.notes||null,userId,storageKey,checksum,file.size])).rows[0];await this.db.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,notes,after_values) VALUES($1,$2,'document_uploaded',$3,$4,$5::jsonb)`,[companyId,supplierId,userId,cleanName,JSON.stringify({document_id:saved.id,document_type:saved.document_type,mime_type:saved.mime_type,file_size:saved.file_size,checksum_sha256:saved.checksum_sha256})]);return saved;}
    catch(error){try{unlinkSync(join(directory,storageKey));}catch{}throw error;}
  }

  async documentDownload(companyId:string,userId:string,supplierId:string,documentId:string){
    const result=await this.db.query(`SELECT id,storage_key,original_filename,mime_type FROM supplier_documents WHERE company_id=$1 AND supplier_id=$2 AND id=$3 AND status<>'archived'`,[companyId,supplierId,documentId]);if(!result.rowCount||!result.rows[0].storage_key)return null;const path=join(process.cwd(),'private_uploads','suppliers',result.rows[0].storage_key);if(!existsSync(path))return null;await this.db.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,notes,after_values) VALUES($1,$2,'document_downloaded',$3,$4,$5::jsonb)`,[companyId,supplierId,userId,result.rows[0].original_filename,JSON.stringify({document_id:documentId})]);return {...result.rows[0],path};
  }

  async dashboard(companyId: string) {
    const [summary, upcomingDocuments, approvals, incidents, concentration] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE supplier_status='active' AND approval_status='approved')::int AS active,
          COUNT(*) FILTER (WHERE approval_status IN ('pending','in_review'))::int AS pending,
          COUNT(*) FILTER (WHERE supplier_status IN ('blocked','suspended'))::int AS blocked,
          COUNT(*) FILTER (WHERE risk_level IN ('high','critical'))::int AS high_risk,
          COUNT(*) FILTER (WHERE supplier_type='national')::int AS national,
          COUNT(*) FILTER (WHERE supplier_type='international')::int AS international
        FROM suppliers WHERE company_id=$1 AND supplier_status<>'archived'`, [companyId]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM supplier_documents
        WHERE company_id=$1 AND status NOT IN ('archived','rejected') AND expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE+30`, [companyId]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM supplier_approval_requests
        WHERE company_id=$1 AND status IN ('pending','in_review')`, [companyId]),
      this.db.query(`SELECT COUNT(*)::int AS count FROM supplier_incidents
        WHERE company_id=$1 AND status IN ('open','investigating') AND severity IN ('high','critical')`, [companyId]),
      this.db.query(`SELECT s.id,s.name,COUNT(i.id)::int AS import_count
        FROM suppliers s LEFT JOIN imports i ON i.supplier_id=s.id AND i.company_id=s.company_id
        WHERE s.company_id=$1 AND s.supplier_status<>'archived'
        GROUP BY s.id,s.name ORDER BY import_count DESC,s.name LIMIT 5`, [companyId]),
    ]);
    const counts = summary.rows[0] || {};
    return {
      total: Number(counts.total || 0), active: Number(counts.active || 0),
      pending: Number(approvals.rows[0]?.count || counts.pending || 0),
      blocked: Number(counts.blocked || 0), highRisk: Number(counts.high_risk || 0),
      documentsExpiring: Number(upcomingDocuments.rows[0]?.count || 0),
      highPriorityIncidents: Number(incidents.rows[0]?.count || 0),
      national: Number(counts.national || 0), international: Number(counts.international || 0),
      concentration: concentration.rows.map((row) => ({ ...row, import_count: Number(row.import_count || 0) })),
      // Financial balances and period totals remain owned by Finance.
    };
  }

  async findAll(companyId: string, filters: SupplierFilters = {}) {
    const result = await this.db.query(`SELECT s.*,c.name AS category_name,
        COUNT(DISTINCT i.id)::int AS total_imports,MAX(i.created_at) AS last_purchase_at
      FROM suppliers s
      LEFT JOIN supplier_categories c ON c.id=s.category_id AND c.company_id=s.company_id
      LEFT JOIN imports i ON i.supplier_id=s.id AND i.company_id=s.company_id
      WHERE s.company_id=$1
        AND ($2::text IS NULL OR s.supplier_type=$2)
        AND ($3::text IS NULL OR s.supplier_status=$3)
        AND ($4::text IS NULL OR CONCAT_WS(' ',s.name,s.legal_name,s.trade_name,s.tax_id,s.country,s.contact_person,s.email,s.brands_handled) ILIKE '%'||$4||'%')
      GROUP BY s.id,c.name ORDER BY s.created_at DESC,s.name`,
    [companyId, filters.type || null, filters.status || null, filters.query?.trim() || null]);
    return result.rows;
  }

  async findById(companyId: string, id: string) {
    const result = await this.db.query(`SELECT s.*,c.name AS category_name FROM suppliers s
      LEFT JOIN supplier_categories c ON c.id=s.category_id AND c.company_id=s.company_id
      WHERE s.id=$1 AND s.company_id=$2`, [id, companyId]);
    return result.rows[0];
  }

  async profile360(companyId: string, id: string) {
    const supplier = await this.findById(companyId, id);
    if (!supplier) return null;
    const [metrics, contacts, products, purchases, imports, documents, evaluations, incidents, events, banks, approvals] = await Promise.all([
      this.db.query(`SELECT
        (SELECT COALESCE(SUM(i.total_cost),0) FROM imports i WHERE i.company_id=$1 AND i.supplier_id=$2) AS imports_total,
        (SELECT COALESCE(SUM(i.total_cost),0) FROM imports i WHERE i.company_id=$1 AND i.supplier_id=$2 AND date_trunc('year',i.import_date)=date_trunc('year',CURRENT_DATE)) AS imports_year,
        (SELECT COUNT(*)::int FROM purchase_orders po WHERE po.company_id=$1 AND po.supplier_id=$2 AND po.status<>'cancelled') AS purchase_orders,
        (SELECT COALESCE(SUM(poi.ordered_quantity*poi.unit_cost),0) FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE po.company_id=$1 AND po.supplier_id=$2 AND po.status<>'cancelled') AS ordered_value,
        (SELECT COALESCE(SUM(i.total_cost),0) FROM imports i WHERE i.company_id=$1 AND i.supplier_id=$2 AND i.status<>'COMPLETED') AS open_imports_value,
        (SELECT MAX(v.tx_date) FROM (SELECT MAX(po.created_at) tx_date FROM purchase_orders po WHERE po.company_id=$1 AND po.supplier_id=$2 UNION ALL SELECT MAX(i.import_date::timestamp) FROM imports i WHERE i.company_id=$1 AND i.supplier_id=$2) v) AS last_transaction,
        (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (gr.arrived_at-po.created_at))/86400.0)::numeric,1) FROM goods_receipts gr JOIN purchase_orders po ON po.id=gr.source_id AND po.company_id=gr.company_id WHERE gr.company_id=$1 AND gr.supplier_id=$2 AND gr.source_type='purchase_order' AND gr.status='closed' AND gr.arrived_at IS NOT NULL) AS avg_delivery_days,
        (SELECT CASE WHEN COUNT(*)=0 THEN NULL ELSE ROUND(100.0*COUNT(*) FILTER(WHERE gr.closed_at::date<=po.expected_date)/COUNT(*),1) END
          FROM goods_receipts gr LEFT JOIN purchase_orders po ON po.id=gr.source_id AND gr.source_type='purchase_order'
          WHERE gr.company_id=$1 AND gr.supplier_id=$2 AND gr.source_type='purchase_order' AND gr.status='closed' AND po.expected_date IS NOT NULL) AS on_time_percent,
        (SELECT CASE WHEN COUNT(*)=0 THEN NULL ELSE ROUND(100.0*COUNT(*) FILTER(WHERE gri.quality_status='rejected')/COUNT(*),1) END
          FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id=gri.receipt_id WHERE gr.company_id=$1 AND gr.supplier_id=$2 AND gr.status='closed') AS rejected_percent,
        (SELECT score FROM supplier_evaluations WHERE company_id=$1 AND supplier_id=$2 ORDER BY period_end DESC,created_at DESC LIMIT 1) AS performance_score`, [companyId,id]),
      this.db.query(`SELECT * FROM supplier_contacts WHERE company_id=$1 AND supplier_id=$2 ORDER BY is_primary DESC,is_active DESC,full_name`, [companyId,id]),
      this.db.query(`SELECT ps.*,p.name product_name,p.sku,p.image_url FROM product_suppliers ps JOIN products p ON p.id=ps.product_id AND p.company_id=ps.company_id WHERE ps.company_id=$1 AND ps.supplier_id=$2 ORDER BY ps.is_preferred DESC,ps.valid_from DESC,p.name`, [companyId,id]),
      this.db.query(`SELECT po.id,po.order_number,po.status,po.expected_date,po.created_at,COALESCE(SUM(poi.ordered_quantity*poi.unit_cost),0) total_value,COALESCE(SUM(poi.ordered_quantity),0)::numeric ordered_units,COALESCE(SUM(poi.received_quantity),0)::numeric received_units
        FROM purchase_orders po LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id WHERE po.company_id=$1 AND po.supplier_id=$2 GROUP BY po.id ORDER BY po.created_at DESC LIMIT 250`, [companyId,id]),
      this.db.query(`SELECT i.id,i.import_date,i.country,i.status,i.bl_number,i.tracking_number,i.estimated_arrival,i.actual_arrival,i.incoterm,i.total_cost
        FROM imports i WHERE i.company_id=$1 AND i.supplier_id=$2 ORDER BY i.import_date DESC LIMIT 250`, [companyId,id]),
      this.db.query(`SELECT id,document_type,document_number,original_filename,mime_type,expires_at,status,notes,uploaded_by,reviewed_by,reviewed_at,created_at,file_url FROM supplier_documents WHERE company_id=$1 AND supplier_id=$2 ORDER BY created_at DESC`, [companyId,id]),
      this.db.query(`SELECT * FROM supplier_evaluations WHERE company_id=$1 AND supplier_id=$2 ORDER BY period_end DESC,created_at DESC`, [companyId,id]),
      this.db.query(`SELECT * FROM supplier_incidents WHERE company_id=$1 AND supplier_id=$2 ORDER BY created_at DESC`, [companyId,id]),
      this.db.query(`SELECT e.*,u.full_name actor_name FROM supplier_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.company_id=$1 AND e.supplier_id=$2 ORDER BY e.created_at DESC LIMIT 500`, [companyId,id]),
      this.db.query(`SELECT id,bank_name,account_holder,account_last_four,account_type,currency,country_code,verification_status,is_active,verified_at,created_at FROM supplier_bank_accounts WHERE company_id=$1 AND supplier_id=$2 ORDER BY is_active DESC,created_at DESC`, [companyId,id]),
      this.db.query(`SELECT id,status,current_step,policy_version,requested_at,resolved_at,resolution_reason FROM supplier_approval_requests WHERE company_id=$1 AND supplier_id=$2 ORDER BY requested_at DESC`, [companyId,id]),
    ]);
    const riskAlerts = [
      ...(supplier.risk_level === 'high' || supplier.risk_level === 'critical' ? [{ type:'risk', label:`Nivel de riesgo ${supplier.risk_level}` }] : []),
      ...banks.rows.filter((row) => row.verification_status === 'pending').map(() => ({ type:'bank', label:'Cuenta bancaria pendiente de verificación' })),
      ...documents.rows.filter((row) => row.expires_at && new Date(row.expires_at) < new Date()).map((row) => ({ type:'document', label:`Documento vencido: ${row.original_filename}` })),
      ...incidents.rows.filter((row) => ['high','critical'].includes(row.severity) && ['open','investigating'].includes(row.status)).map((row) => ({ type:'incident', label:row.title })),
    ];
    return {
      supplier,
      metrics: { ...metrics.rows[0], imports_total:Number(metrics.rows[0]?.imports_total||0), imports_year:Number(metrics.rows[0]?.imports_year||0), purchase_orders:Number(metrics.rows[0]?.purchase_orders||0), ordered_value:Number(metrics.rows[0]?.ordered_value||0), open_imports_value:Number(metrics.rows[0]?.open_imports_value||0) },
      contacts: contacts.rows, products: products.rows, purchases: purchases.rows, imports: imports.rows,
      finance: { importCosts: imports.rows.map(({id:importId,import_date,status,total_cost,country,bl_number})=>({id:importId,date:import_date,status,amount:total_cost,country,reference:bl_number})), note:'El ERP aún no tiene un libro de facturas y pagos a proveedores ligado a esta ficha. El valor de operaciones abiertas sigue el criterio actual de Finanzas.' },
      payments: [], documents: documents.rows, evaluations: evaluations.rows, incidents: incidents.rows,
      risks: riskAlerts, audit: events.rows, approvals: approvals.rows, bankAccounts: banks.rows,
    };
  }

  async categories(companyId: string, supplierType?: 'national' | 'international') {
    return (await this.db.query(`SELECT c.*,p.name AS parent_name FROM supplier_categories c
      LEFT JOIN supplier_categories p ON p.id=c.parent_id AND p.company_id=c.company_id
      WHERE c.company_id=$1 AND ($2::text IS NULL OR c.supplier_type=$2)
      ORDER BY c.supplier_type,c.sort_order,c.name`, [companyId, supplierType || null])).rows;
  }

  async createCategory(companyId: string, userId: string, category: any) {
    const result = await this.db.query(`INSERT INTO supplier_categories(company_id,supplier_type,parent_id,name,description,sort_order,created_by,is_critical)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId, category.supplier_type, category.parent_id || null, String(category.name).trim(), category.description || null, Number(category.sort_order || 0), userId,Boolean(category.is_critical)]);
    return result.rows[0];
  }

  async approvalPolicies(companyId: string, supplierType?: 'national'|'international') {
    return (await this.db.query(`SELECT * FROM supplier_approval_policies WHERE company_id=$1 AND ($2::text IS NULL OR supplier_type=$2) ORDER BY supplier_type,is_active DESC,version DESC`,[companyId,supplierType||null])).rows;
  }

  async saveApprovalPolicy(companyId: string, userId: string, policy: any) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE supplier_approval_policies SET is_active=false,updated_at=NOW() WHERE company_id=$1 AND supplier_type=$2 AND is_active',[companyId,policy.supplier_type]);
      const version=await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM supplier_approval_policies WHERE company_id=$1 AND supplier_type=$2',[companyId,policy.supplier_type]);
      const saved=await client.query(`INSERT INTO supplier_approval_policies(company_id,supplier_type,name,conditions,approval_steps,version,is_active,created_by,requires_approval,auto_activate,require_distinct_approvers)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,true,$7,$8,$9,$10) RETURNING *`,[companyId,policy.supplier_type,String(policy.name).trim(),JSON.stringify(policy.conditions||{}),JSON.stringify(policy.approval_steps||[]),version.rows[0].version,userId,policy.requires_approval!==false,policy.auto_activate!==false,Boolean(policy.require_distinct_approvers)]);
      await client.query('COMMIT');return saved.rows[0];
    } catch(error) { await client.query('ROLLBACK');throw error; }
    finally { client.release(); }
  }

  async evaluationPolicies(companyId:string){return (await this.db.query(`SELECT * FROM supplier_evaluation_policies WHERE company_id=$1 ORDER BY is_active DESC,version DESC`,[companyId])).rows;}

  async saveEvaluationPolicy(companyId:string,userId:string,data:any){
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');await client.query('UPDATE supplier_evaluation_policies SET is_active=false WHERE company_id=$1 AND is_active',[companyId]);const v=await client.query('SELECT COALESCE(MAX(version),0)+1 version FROM supplier_evaluation_policies WHERE company_id=$1',[companyId]);const row=await client.query(`INSERT INTO supplier_evaluation_policies(company_id,name,criteria_weights,minimum_confidence_operations,reference_score,version,is_active,created_by) VALUES($1,$2,$3::jsonb,$4,$5,$6,true,$7) RETURNING *`,[companyId,String(data.name).trim(),JSON.stringify(data.criteria_weights),Number(data.minimum_confidence_operations||10),Number(data.reference_score??75),v.rows[0].version,userId]);await client.query('COMMIT');return row.rows[0];}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async createEvaluation(companyId:string,userId:string,supplierId:string,data:any){
    const supplier=await this.findById(companyId,supplierId);if(!supplier)return null;
    const policy=(await this.evaluationPolicies(companyId)).find((row)=>row.is_active);
    const weights=policy?.criteria_weights||{quality:25,delivery:25,price:20,documents:15,communication:15};
    const scores=data.criteria_scores;const raw=Object.entries(weights).reduce((sum,[key,weight])=>sum+(Number(scores[key])||0)*Number(weight)/100,0);
    const operations=Math.max(0,Number(data.operation_count)||0);const k=Number(policy?.minimum_confidence_operations||10);const confidence=Math.min(1,operations/k);const reference=Number(policy?.reference_score??75);const adjusted=raw*confidence+reference*(1-confidence);
    const performance=adjusted>=90?'excellent':adjusted>=80?'good':adjusted>=70?'acceptable':adjusted>=50?'deficient':'critical';
    const saved=await this.db.query(`INSERT INTO supplier_evaluations(company_id,supplier_id,period_start,period_end,score,raw_score,confidence_factor,operation_count,criteria_scores,policy_version,performance_class,risk_level,notes,evaluated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14) RETURNING *`,[companyId,supplierId,data.period_start,data.period_end,adjusted.toFixed(2),raw.toFixed(2),confidence.toFixed(4),operations,JSON.stringify(scores),policy?.version||null,performance,data.risk_level||'low',data.notes||null,userId]);
    await this.db.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,notes,after_values) VALUES($1,$2,'evaluated',$3,$4,$5::jsonb)`,[companyId,supplierId,userId,`Evaluación v${policy?.version||'predeterminada'}`,JSON.stringify(saved.rows[0])]);
    return saved.rows[0];
  }

  async evaluations(companyId:string,supplierId?:string){return (await this.db.query(`SELECT e.*,s.name supplier_name,s.supplier_code FROM supplier_evaluations e JOIN suppliers s ON s.id=e.supplier_id AND s.company_id=e.company_id WHERE e.company_id=$1 AND ($2::uuid IS NULL OR e.supplier_id=$2) ORDER BY e.period_end DESC,e.created_at DESC LIMIT 1000`,[companyId,supplierId||null])).rows;}

  async riskOverview(companyId:string,supplierId:string){
    const supplier=await this.findById(companyId,supplierId);if(!supplier)return null;
    const [expiredDocs,incidents,bankChanges,variances,concentration,lateDeliveries]=await Promise.all([
      this.db.query(`SELECT id,original_filename,expires_at FROM supplier_documents WHERE company_id=$1 AND supplier_id=$2 AND status<>'archived' AND expires_at<CURRENT_DATE`,[companyId,supplierId]),
      this.db.query(`SELECT id,title,severity,status,incident_type,created_at FROM supplier_incidents WHERE company_id=$1 AND supplier_id=$2 AND status IN ('open','investigating') ORDER BY created_at DESC`,[companyId,supplierId]),
      this.db.query(`SELECT id,requested_at FROM supplier_approval_requests WHERE company_id=$1 AND supplier_id=$2 AND request_type='bank_account_change' AND status IN ('pending','in_review') ORDER BY requested_at DESC LIMIT 1`,[companyId,supplierId]),
      this.db.query(`SELECT COUNT(*)::int count FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id=gri.receipt_id WHERE gr.company_id=$1 AND gr.supplier_id=$2 AND gr.status='closed' AND (gri.damaged_quantity>0 OR gri.missing_quantity>0 OR gri.surplus_quantity>0 OR gri.quality_status='rejected')`,[companyId,supplierId]),
      this.db.query(`SELECT COALESCE((SELECT SUM(total_cost) FROM imports WHERE company_id=$1 AND supplier_id=$2),0) supplier_total,COALESCE((SELECT SUM(total_cost) FROM imports WHERE company_id=$1),0) company_total`,[companyId,supplierId]),
      this.db.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE gr.closed_at::date>po.expected_date)::int late FROM goods_receipts gr JOIN purchase_orders po ON po.id=gr.source_id AND po.company_id=gr.company_id WHERE gr.company_id=$1 AND gr.supplier_id=$2 AND gr.source_type='purchase_order' AND gr.status='closed' AND po.expected_date IS NOT NULL`,[companyId,supplierId]),
    ]);
    const alerts:any[]=[];const push=(key:string,category:string,severity:string,title:string,description:string,review:boolean,sourceType?:string,sourceId?:string)=>alerts.push({key,category,severity,title,description,review,sourceType,sourceId});
    if(bankChanges.rowCount)push('bank_change_pending','financial','critical','Cambio bancario pendiente','Existe un cambio de cuenta bancaria que requiere revisión por otra persona.',true,'approval_request',bankChanges.rows[0].id);
    if(expiredDocs.rowCount)push('expired_supplier_documents','documentary','critical','Documentación vencida',`${expiredDocs.rowCount} documento(s) del proveedor están vencidos.`,true,'supplier_document',expiredDocs.rows[0].id);
    const profile=supplier.supplier_type==='national'?supplier.national_profile||{}:supplier.international_profile||{};
    const verified=String(profile.tax_validation_status||profile.tax_verification_status||'').toLowerCase().includes('valid');
    if(supplier.tax_id&&!verified)push('tax_id_unverified','compliance','high','Identificación fiscal sin verificar','La identificación fiscal existe, pero no hay constancia de validación registrada.',true,'supplier',supplier.id);
    const severeIncidents=incidents.rows.filter((row)=>['high','critical'].includes(row.severity));
    if(incidents.rowCount)push('open_commercial_incidents','commercial',severeIncidents.length>=2?'critical':'high','Incidencias pendientes',`${incidents.rowCount} incidencia(s) siguen abiertas o en investigación.`,severeIncidents.length>0,'supplier_incident',incidents.rows[0].id);
    const varianceCount=Number(variances.rows[0]?.count||0);
    if(varianceCount)push('receipt_variances','logistical',varianceCount>=3?'high':'medium','Diferencias en recepciones',`${varianceCount} líneas de recepción presentan daños, faltantes, sobrantes o rechazo de calidad.`,varianceCount>=3,'goods_receipt_item');
    const supplierSpend=Number(concentration.rows[0]?.supplier_total||0);const companySpend=Number(concentration.rows[0]?.company_total||0);const share=companySpend>0?supplierSpend/companySpend:0;
    if(share>=0.5)push('purchase_concentration','financial',share>=0.75?'high':'medium','Concentración de compras',`${(share*100).toFixed(1)}% del costo de importaciones registrado está concentrado en este proveedor.`,share>=0.75,'imports');
    const totalDeliveries=Number(lateDeliveries.rows[0]?.total||0);const lateCount=Number(lateDeliveries.rows[0]?.late||0);
    if(totalDeliveries>=3&&lateCount/totalDeliveries>=0.3)push('repeated_late_deliveries','logistical',lateCount/totalDeliveries>=0.5?'high':'medium','Incumplimientos de entrega',`${lateCount} de ${totalDeliveries} recepciones cerradas llegaron después de la fecha esperada.`,lateCount/totalDeliveries>=0.5,'goods_receipt');
    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');for(const alert of alerts){await client.query(`INSERT INTO supplier_risk_alerts(company_id,supplier_id,alert_key,risk_category,severity,title,description,review_required,source_type,source_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(company_id,supplier_id,alert_key) WHERE resolved_at IS NULL DO UPDATE SET risk_category=EXCLUDED.risk_category,severity=EXCLUDED.severity,title=EXCLUDED.title,description=EXCLUDED.description,review_required=EXCLUDED.review_required`,[companyId,supplierId,alert.key,alert.category,alert.severity,alert.title,alert.description,alert.review,alert.sourceType||null,alert.sourceId||null]);}
      const keys=alerts.map(a=>a.key);await client.query(`UPDATE supplier_risk_alerts SET resolved_at=NOW(),review_status='resolved' WHERE company_id=$1 AND supplier_id=$2 AND resolved_at IS NULL AND NOT(alert_key=ANY($3::text[]))`,[companyId,supplierId,keys]);
      const openAlerts=await client.query(`SELECT id FROM supplier_risk_alerts WHERE company_id=$1 AND supplier_id=$2 AND resolved_at IS NULL AND review_required AND review_status='open' AND review_request_id IS NULL`,[companyId,supplierId]);
      if(openAlerts.rowCount){let request=await client.query(`SELECT id FROM supplier_approval_requests WHERE company_id=$1 AND supplier_id=$2 AND request_type='risk_review' AND status IN ('pending','in_review') ORDER BY requested_at LIMIT 1`,[companyId,supplierId]);let requestId=request.rows[0]?.id;if(!requestId){const policy=await client.query(`SELECT id,version FROM supplier_approval_policies WHERE company_id=$1 AND supplier_type=$2 AND is_active ORDER BY version DESC LIMIT 1`,[companyId,supplier.supplier_type]);const created=await client.query(`INSERT INTO supplier_approval_requests(company_id,supplier_id,policy_id,policy_version,requested_by,supplier_snapshot,status,request_type,supplier_version) VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending','risk_review',$7) RETURNING id`,[companyId,supplierId,policy.rows[0]?.id||null,policy.rows[0]?.version||null,null,JSON.stringify({previous_supplier_status:supplier.supplier_status,previous_approval_status:supplier.approval_status,alert_ids:openAlerts.rows.map(r=>r.id)}),supplier.record_version||1]);requestId=created.rows[0].id;await client.query(`UPDATE suppliers SET approval_status='in_review',updated_at=NOW() WHERE id=$1 AND company_id=$2`,[supplierId,companyId]);}
        await client.query(`UPDATE supplier_risk_alerts SET review_request_id=$3,review_status='in_review' WHERE company_id=$1 AND supplier_id=$2 AND id=ANY($4::uuid[])`,[companyId,supplierId,requestId,openAlerts.rows.map(r=>r.id)]);
      }
      const stored=await client.query(`SELECT * FROM supplier_risk_alerts WHERE company_id=$1 AND supplier_id=$2 ORDER BY resolved_at NULLS FIRST,severity DESC,created_at DESC`,[companyId,supplierId]);await client.query('COMMIT');
      const categories=['commercial','financial','logistical','documentary','compliance'].map(category=>({category,alerts:stored.rows.filter(row=>row.risk_category===category&&!row.resolved_at),openCount:stored.rows.filter(row=>row.risk_category===category&&!row.resolved_at).length,requiresReview:stored.rows.some(row=>row.risk_category===category&&!row.resolved_at&&row.review_required&&row.review_status!=='reviewed')}));
      return {categories,alerts:stored.rows,requiresReview:categories.some(c=>c.requiresReview),delivery:{total:totalDeliveries,late:lateCount},purchaseConcentrationPercent:Number((share*100).toFixed(1))};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async create(companyId: string, userId: string, supplier: any) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const nationalProfile = { ...(supplier.national_profile || {}) };
      const internationalProfile = { ...(supplier.international_profile || {}) };
      const profile = supplier.supplier_type === 'national' ? nationalProfile : internationalProfile;
      const bankAccount = profile.account_number ? String(profile.account_number).trim() : '';
      delete nationalProfile.account_number;
      delete internationalProfile.account_number;
      const policy = await client.query(`SELECT id,version,approval_steps,requires_approval,auto_activate,require_distinct_approvers FROM supplier_approval_policies
        WHERE company_id=$1 AND supplier_type=$2 AND is_active ORDER BY version DESC,created_at DESC LIMIT 1`, [companyId,supplier.supplier_type]);
      const requiresApproval = policy.rowCount ? Boolean(policy.rows[0].requires_approval) : true;
      const supplierStatus = requiresApproval ? 'pending_approval' : policy.rows[0].auto_activate ? 'active' : 'approved';
      const approvalStatus = requiresApproval ? 'pending' : 'approved';
      const result = await client.query(`INSERT INTO suppliers(
        company_id,supplier_type,name,legal_name,trade_name,country,tax_id,tax_id_type,contact_person,email,phone,
        incoterm_default,shipping_port,estimated_lead_time,payment_terms,payment_currency,brands_handled,website,category_id,
        supplier_status,approval_status,risk_level,created_by,updated_by,national_profile,international_profile
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$23,$24,'unrated',$20,$20,$21::jsonb,$22::jsonb) RETURNING *`,
    [companyId, supplier.supplier_type, String(supplier.name || '').trim(), supplier.legal_name || null, supplier.trade_name || null,
      supplier.country || (supplier.supplier_type === 'national' ? 'Ecuador' : null), supplier.tax_id || null, supplier.tax_id_type || null,
      supplier.contact_person || null, supplier.email || null, supplier.phone || null, supplier.incoterm_default || null,
      supplier.shipping_port || null, supplier.estimated_lead_time == null ? null : Number(supplier.estimated_lead_time),
      supplier.payment_terms || null, supplier.payment_currency || 'USD', supplier.brands_handled || null, supplier.website || null,
      supplier.category_id || null, userId, JSON.stringify(nationalProfile), JSON.stringify(internationalProfile),supplierStatus,approvalStatus]);
      const saved = result.rows[0];
      if(!requiresApproval) await client.query('UPDATE suppliers SET approved_at=NOW() WHERE id=$1 AND company_id=$2',[saved.id,companyId]);
      if (supplier.supplier_type === 'national' || supplier.supplier_type === 'international') {
        saved.supplier_code = `${supplier.supplier_type === 'national' ? 'NAC' : 'INT'}-${String(saved.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
        await client.query('UPDATE suppliers SET supplier_code=$3 WHERE id=$1 AND company_id=$2', [saved.id, companyId, saved.supplier_code]);
      }
      if (bankAccount) {
        if (!profile.bank_name?.trim() || !profile.account_holder?.trim()) throw new Error('Completa el banco y el titular para guardar la cuenta protegida.');
        const ciphertext = this.encryptBankAccount(bankAccount);
        await client.query(`INSERT INTO supplier_bank_accounts(company_id,supplier_id,bank_name,account_holder,account_number_ciphertext,account_last_four,account_type,currency,country_code,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [companyId,saved.id,String(profile.bank_name).trim(),String(profile.account_holder).trim(),ciphertext,bankAccount.slice(-4),profile.account_type||null,profile.bank_currency||profile.payment_currency||supplier.payment_currency||'USD',profile.bank_country_code||null,userId]);
      }
      const request = await client.query(`INSERT INTO supplier_approval_requests(company_id,supplier_id,policy_id,policy_version,requested_by,supplier_snapshot,status,request_type,supplier_version,require_distinct_approvers)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'registration',1,$8) RETURNING id`, [companyId, saved.id, policy.rows[0]?.id || null, policy.rows[0]?.version || null, userId, JSON.stringify(saved),requiresApproval?'pending':'approved',Boolean(policy.rows[0]?.require_distinct_approvers)]);
      if (!requiresApproval) {
        await client.query(`INSERT INTO supplier_approval_decisions(company_id,request_id,supplier_id,decision_type,comment,supplier_version,result)
          VALUES($1,$2,$3,'auto_approved','Aprobado automáticamente por la política configurada.',1,$4)`,[companyId,request.rows[0].id,saved.id,supplierStatus]);
      }
      await client.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,after_values)
      VALUES($1,$2,'created',$3,$4::jsonb)`, [companyId, saved.id, userId, JSON.stringify(saved)]);
      await client.query('COMMIT');
      return saved;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async update(companyId: string, userId: string, id: string, supplier: any) {
    const allowed = ['name','legal_name','trade_name','country','tax_id','tax_id_type','contact_person','email','phone','incoterm_default','shipping_port','estimated_lead_time','payment_terms','payment_currency','brands_handled','website','category_id','risk_level','national_profile','international_profile'];
    const patch = Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(supplier, key)).map((key) => [key, supplier[key]]));
    if (!Object.keys(patch).length) return this.findById(companyId, id);
    let bankAccountChange:any=null;
    for(const profileKey of ['national_profile','international_profile']) if(patch[profileKey]?.account_number){
      const profile={...patch[profileKey]};
      const accountNumber=String(profile.account_number).trim();delete profile.account_number;patch[profileKey]=profile;
      bankAccountChange={bank_name:profile.bank_name,account_holder:profile.account_holder,account_type:profile.account_type,currency:profile.bank_currency||profile.payment_currency||'USD',country_code:profile.bank_country_code||null,ciphertext:this.encryptBankAccount(accountNumber),last_four:accountNumber.slice(-4)};
    }
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const before = await client.query('SELECT * FROM suppliers WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, companyId]);
      if (!before.rowCount) { await client.query('ROLLBACK'); return null; }
      const current=before.rows[0];
      const pendingReview=await client.query(`SELECT id FROM supplier_approval_requests WHERE company_id=$1 AND supplier_id=$2 AND status IN ('pending','in_review') LIMIT 1`,[companyId,id]);
      if(pendingReview.rowCount){await client.query('ROLLBACK');return {error:'change_already_pending'};}
      const changed=Object.keys(patch).filter(key=>JSON.stringify(patch[key]??null)!==JSON.stringify(current[key]??null));
      let criticalCategory=false;
      if(changed.includes('category_id')){const category=await client.query('SELECT id,is_critical FROM supplier_categories WHERE company_id=$1 AND id=ANY($2::uuid[])',[companyId,[current.category_id,patch.category_id].filter(Boolean)]);criticalCategory=category.rows.some((row)=>Boolean(row.is_critical));}
      const identificationChange=changed.some(key=>['tax_id','tax_id_type','legal_name'].includes(key));
      const creditChange=changed.some(key=>['payment_terms','payment_currency'].includes(key))||changed.some(key=>['national_profile','international_profile'].includes(key)&&['credit_days','credit_limit'].some(f=>patch[key]?.[f]!==current[key]?.[f]));
      const currentPolicy=creditChange?await client.query(`SELECT conditions FROM supplier_approval_policies WHERE company_id=$1 AND supplier_type=$2 AND is_active ORDER BY version DESC LIMIT 1`,[companyId,current.supplier_type]):null;
      const riskLevels: string[]=Array.isArray(currentPolicy?.rows[0]?.conditions?.credit_risk_levels)?currentPolicy!.rows[0].conditions.credit_risk_levels:['medium','high','critical'];
      const needsSensitiveApproval=['approved','active','blocked','suspended'].includes(current.supplier_status)&&Boolean(bankAccountChange||identificationChange||criticalCategory||(creditChange&&riskLevels.includes(current.risk_level)));
      if(needsSensitiveApproval){
        if(bankAccountChange&&(!String(bankAccountChange.bank_name||'').trim()||!String(bankAccountChange.account_holder||'').trim()))throw new Error('Completa banco y titular para solicitar la validación del cambio de cuenta.');
        const requestType=bankAccountChange?'bank_account_change':identificationChange?'identification_change':criticalCategory?'critical_category_change':'credit_terms_change';
        const duplicate=await client.query(`SELECT id FROM supplier_approval_requests WHERE company_id=$1 AND supplier_id=$2 AND status IN ('pending','in_review') LIMIT 1`,[companyId,id]);
        if(duplicate.rowCount){await client.query('ROLLBACK');return {error:'change_already_pending'};}
        const policy=await client.query(`SELECT id,version,require_distinct_approvers FROM supplier_approval_policies WHERE company_id=$1 AND supplier_type=$2 AND is_active ORDER BY version DESC LIMIT 1`,[companyId,current.supplier_type]);
        const proposed={proposed_changes:patch,bank_account:bankAccountChange,previous_supplier_status:current.supplier_status,previous_approval_status:current.approval_status};
        const request=await client.query(`INSERT INTO supplier_approval_requests(company_id,supplier_id,policy_id,policy_version,requested_by,supplier_snapshot,status,request_type,supplier_version,require_distinct_approvers)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending',$7,$8,$9) RETURNING *`,[companyId,id,policy.rows[0]?.id||null,policy.rows[0]?.version||null,userId,JSON.stringify(proposed),requestType,current.record_version||1,requestType==='bank_account_change'&&Boolean(policy.rows[0]?.require_distinct_approvers)]);
        await client.query(`UPDATE suppliers SET approval_status='in_review',updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2`,[id,companyId,userId]);
        await client.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,before_values,after_values,notes) VALUES($1,$2,'sensitive_change_requested',$3,$4::jsonb,$5::jsonb,$6)`,[companyId,id,userId,JSON.stringify(current),JSON.stringify(proposed),requestType]);
        await client.query('COMMIT');return {change_request:true,request:request.rows[0]};
      }
      if(bankAccountChange){
        if(!String(bankAccountChange.bank_name||'').trim()||!String(bankAccountChange.account_holder||'').trim())throw new Error('Completa banco y titular para guardar la cuenta bancaria protegida.');
        await client.query('UPDATE supplier_bank_accounts SET is_active=false WHERE company_id=$1 AND supplier_id=$2 AND is_active',[companyId,id]);
        await client.query(`INSERT INTO supplier_bank_accounts(company_id,supplier_id,bank_name,account_holder,account_number_ciphertext,account_last_four,account_type,currency,country_code,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[companyId,id,bankAccountChange.bank_name,bankAccountChange.account_holder,bankAccountChange.ciphertext,bankAccountChange.last_four,bankAccountChange.account_type,bankAccountChange.currency,bankAccountChange.country_code,userId]);
      }
      const keys = Object.keys(patch);
      const params = keys.map((key) => patch[key]);
      const assignments = keys.map((key, index) => `${key}=$${index + 3}`);
      params.push(userId);
      const saved = await client.query(`UPDATE suppliers SET ${assignments.join(',')},record_version=record_version+1,updated_by=$${params.length + 2},updated_at=NOW()
        WHERE id=$1 AND company_id=$2 RETURNING *`, [id, companyId, ...params]);
      if(current.supplier_status==='observed'){
        const prior=await client.query(`SELECT request_type FROM supplier_approval_requests WHERE company_id=$1 AND supplier_id=$2 AND status='observed' ORDER BY requested_at DESC LIMIT 1`,[companyId,id]);
        const policy=await client.query(`SELECT id,version FROM supplier_approval_policies WHERE company_id=$1 AND supplier_type=$2 AND is_active ORDER BY version DESC LIMIT 1`,[companyId,current.supplier_type]);
        const resubmitted=await client.query(`UPDATE suppliers SET supplier_status='pending_approval',approval_status='pending' WHERE id=$1 AND company_id=$2 RETURNING *`,[id,companyId]);
        saved.rows[0]=resubmitted.rows[0];
        await client.query(`INSERT INTO supplier_approval_requests(company_id,supplier_id,policy_id,policy_version,requested_by,supplier_snapshot,status,request_type,supplier_version)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending',$7,$8)`,[companyId,id,policy.rows[0]?.id||null,policy.rows[0]?.version||null,userId,JSON.stringify(saved.rows[0]),prior.rows[0]?.request_type||'registration',saved.rows[0].record_version]);
      }
      await client.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,before_values,after_values)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [companyId, id, current.supplier_status==='observed'?'resubmitted':'updated', userId, JSON.stringify(before.rows[0]), JSON.stringify(saved.rows[0])]);
      await client.query('COMMIT');
      return saved.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async approvals(companyId: string, status?: string) {
    return (await this.db.query(`SELECT a.*,s.name supplier_name,s.supplier_type,s.country,s.tax_id,s.supplier_status,s.supplier_code,u.full_name requested_by_name,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'decision_by',d.decision_by,'decision_by_name',(SELECT full_name FROM users WHERE id=d.decision_by),'decision_type',d.decision_type,'comment',d.comment,'supplier_version',d.supplier_version,'reviewed_documents',d.reviewed_documents,'result',d.result,'decided_at',d.decided_at) ORDER BY d.decided_at) FROM supplier_approval_decisions d WHERE d.company_id=a.company_id AND d.request_id=a.id),'[]'::jsonb) decisions
      ,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',doc.id,'name',doc.original_filename,'type',doc.document_type,'status',doc.status,'expires_at',doc.expires_at)) FROM supplier_documents doc WHERE doc.company_id=a.company_id AND doc.supplier_id=s.id AND doc.status<>'archived'),'[]'::jsonb) documents
      ,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',risk.id,'title',risk.title,'description',risk.description,'severity',risk.severity,'risk_category',risk.risk_category)) FROM supplier_risk_alerts risk WHERE risk.company_id=a.company_id AND risk.supplier_id=s.id AND risk.review_request_id=a.id AND risk.resolved_at IS NULL),'[]'::jsonb) risk_alerts
      FROM supplier_approval_requests a JOIN suppliers s ON s.id=a.supplier_id AND s.company_id=a.company_id
      LEFT JOIN users u ON u.id=a.requested_by
      WHERE a.company_id=$1 AND ($2::text IS NULL OR a.status=$2)
      ORDER BY a.requested_at DESC LIMIT 500`, [companyId, status || null])).rows;
  }

  async activateSupplier(companyId: string, userId: string, supplierId: string) {
    const client=await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const supplier=await client.query(`SELECT * FROM suppliers WHERE id=$1 AND company_id=$2 FOR UPDATE`,[supplierId,companyId]);
      if(!supplier.rowCount){await client.query('ROLLBACK');return {error:'not_found'};}
      if(supplier.rows[0].approval_status!=='approved'||supplier.rows[0].supplier_status!=='approved'){await client.query('ROLLBACK');return {error:'not_approved'};}
      const request=await client.query(`SELECT id FROM supplier_approval_requests WHERE company_id=$1 AND supplier_id=$2 AND status='approved' ORDER BY resolved_at DESC NULLS LAST LIMIT 1`,[companyId,supplierId]);
      if(!request.rowCount){await client.query('ROLLBACK');return {error:'approval_record_missing'};}
      const updated=await client.query(`UPDATE suppliers SET supplier_status='active',updated_by=$3,updated_at=NOW(),record_version=record_version+1 WHERE id=$1 AND company_id=$2 RETURNING *`,[supplierId,companyId,userId]);
      await client.query(`INSERT INTO supplier_approval_decisions(company_id,request_id,supplier_id,decision_by,decision_type,comment,supplier_version,result) VALUES($1,$2,$3,$4,'activated','Activación operativa autorizada.',$5,'active')`,[companyId,request.rows[0].id,supplierId,userId,updated.rows[0].record_version]);
      await client.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,before_values,after_values) VALUES($1,$2,'activated',$3,$4::jsonb,$5::jsonb)`,[companyId,supplierId,userId,JSON.stringify(supplier.rows[0]),JSON.stringify(updated.rows[0])]);
      await client.query('COMMIT');return updated.rows[0];
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }

  async requestUnlock(companyId:string,userId:string,supplierId:string){
    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');const supplier=await client.query('SELECT * FROM suppliers WHERE id=$1 AND company_id=$2 FOR UPDATE',[supplierId,companyId]);if(!supplier.rowCount){await client.query('ROLLBACK');return {error:'not_found'};}const row=supplier.rows[0];if(!['blocked','suspended'].includes(row.supplier_status)){await client.query('ROLLBACK');return {error:'not_restricted'};}const existing=await client.query(`SELECT id FROM supplier_approval_requests WHERE company_id=$1 AND supplier_id=$2 AND status IN ('pending','in_review') LIMIT 1`,[companyId,supplierId]);if(existing.rowCount){await client.query('ROLLBACK');return {error:'change_already_pending'};}const policy=await client.query(`SELECT id,version FROM supplier_approval_policies WHERE company_id=$1 AND supplier_type=$2 AND is_active ORDER BY version DESC LIMIT 1`,[companyId,row.supplier_type]);const created=await client.query(`INSERT INTO supplier_approval_requests(company_id,supplier_id,policy_id,policy_version,requested_by,supplier_snapshot,status,request_type,supplier_version) VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending','unlock',$7) RETURNING *`,[companyId,supplierId,policy.rows[0]?.id||null,policy.rows[0]?.version||null,userId,JSON.stringify({previous_supplier_status:row.supplier_status,previous_approval_status:row.approval_status}),row.record_version||1]);await client.query(`UPDATE suppliers SET approval_status='in_review',updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2`,[supplierId,companyId,userId]);await client.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,notes,after_values) VALUES($1,$2,'unlock_requested',$3,$4,$5::jsonb)`,[companyId,supplierId,userId,row.blocked_reason||null,JSON.stringify(created.rows[0])]);await client.query('COMMIT');return created.rows[0];}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async reviewApproval(companyId: string, userId: string, id: string, decision: 'approved' | 'rejected' | 'observed', reason?: string, userRoles: string[] = [], reviewedDocuments: string[] = []) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const request = await client.query(`SELECT a.*,s.record_version,s.supplier_status,s.approval_status,p.approval_steps,p.auto_activate FROM supplier_approval_requests a
        JOIN suppliers s ON s.id=a.supplier_id AND s.company_id=a.company_id
        LEFT JOIN supplier_approval_policies p ON p.id=a.policy_id
        WHERE a.id=$1 AND a.company_id=$2 AND a.status IN ('pending','in_review') FOR UPDATE OF a,s`, [id, companyId]);
      if (!request.rowCount) { await client.query('ROLLBACK'); return null; }
      if (request.rows[0].requested_by === userId) {
        await client.query('ROLLBACK');
        return { error: 'self_approval' };
      }
      if ((decision === 'rejected' || decision === 'observed') && !reason?.trim()) {
        await client.query('ROLLBACK');
        return { error: decision === 'observed' ? 'observation_reason_required' : 'rejection_reason_required' };
      }
      const requestRow = request.rows[0];
      if(requestRow.request_type==='bank_account_change'&&requestRow.require_distinct_approvers){const prior=await client.query(`SELECT 1 FROM supplier_approval_decisions WHERE company_id=$1 AND request_id=$2 AND decision_by=$3 AND decision_type='approved' LIMIT 1`,[companyId,id,userId]);if(prior.rowCount){await client.query('ROLLBACK');return {error:'distinct_approver_required'};}}
      if (Number(requestRow.supplier_version) !== Number(requestRow.record_version)) {
        await client.query('ROLLBACK');
        return { error: 'stale_version' };
      }
      let reviewedDocumentRows:any[]=[];
      if(reviewedDocuments.length){const docs=await client.query(`SELECT id,original_filename,document_type,status,expires_at FROM supplier_documents WHERE company_id=$1 AND supplier_id=$2 AND id=ANY($3::uuid[])`,[companyId,requestRow.supplier_id,reviewedDocuments]);if(Number(docs.rowCount||0)!==new Set(reviewedDocuments).size){await client.query('ROLLBACK');return {error:'invalid_reviewed_documents'};}reviewedDocumentRows=docs.rows;}
      const steps = Array.isArray(requestRow.approval_steps) ? requestRow.approval_steps : [];
      const step = steps[Number(requestRow.current_step || 1) - 1];
      const permittedRoles: string[] = Array.isArray(step) ? step : Array.isArray(step?.roles) ? step.roles : step?.role ? [step.role] : [];
      if (permittedRoles.length && !permittedRoles.some((role) => userRoles.includes(role))) {
        await client.query('ROLLBACK');
        return { error: 'role_not_allowed' };
      }
      const supplierId = request.rows[0].supplier_id;
      const snapshot=typeof requestRow.supplier_snapshot==='string'?JSON.parse(requestRow.supplier_snapshot):requestRow.supplier_snapshot||{};
      const finalApproval = decision === 'approved' && (!steps.length || Number(requestRow.current_step || 1) >= steps.length);
      const nextStatus = decision === 'rejected' ? 'rejected' : decision === 'observed' ? 'observed' : finalApproval ? 'approved' : 'in_review';
      const registration=requestRow.request_type==='registration';
      const riskReview=requestRow.request_type==='risk_review';
      const approvalStatus=riskReview?(snapshot.previous_approval_status||requestRow.approval_status):nextStatus==='approved'?'approved':nextStatus==='in_review'?'in_review':nextStatus==='observed'?'observed':registration?'rejected':snapshot.previous_approval_status||requestRow.approval_status;
      const supplierStatus=registration?(nextStatus==='approved'?(requestRow.auto_activate===true?'active':'approved'):nextStatus==='in_review'?'in_review':nextStatus==='observed'?'observed':'inactive'):requestRow.request_type==='unlock'&&finalApproval?'active':snapshot.previous_supplier_status||requestRow.supplier_status;
      if(finalApproval&&!registration){
        const proposed=snapshot.proposed_changes||{};
        const allowed=['name','legal_name','trade_name','country','tax_id','tax_id_type','contact_person','email','phone','incoterm_default','shipping_port','estimated_lead_time','payment_terms','payment_currency','brands_handled','website','category_id','risk_level','national_profile','international_profile'];
        const keys=Object.keys(proposed).filter(key=>allowed.includes(key));
        if(keys.length){const params=keys.map(key=>proposed[key]);await client.query(`UPDATE suppliers SET ${keys.map((key,index)=>`${key}=$${index+3}`).join(',')} WHERE id=$1 AND company_id=$2`,[supplierId,companyId,...params]);}
        if(snapshot.bank_account?.ciphertext){const bank=snapshot.bank_account;await client.query('UPDATE supplier_bank_accounts SET is_active=false WHERE company_id=$1 AND supplier_id=$2 AND is_active',[companyId,supplierId]);await client.query(`INSERT INTO supplier_bank_accounts(company_id,supplier_id,bank_name,account_holder,account_number_ciphertext,account_last_four,account_type,currency,country_code,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[companyId,supplierId,bank.bank_name,bank.account_holder,bank.ciphertext,bank.last_four,bank.account_type,bank.currency,bank.country_code,userId]);}
      }
      const updated = await client.query(`UPDATE supplier_approval_requests SET status=$3,current_step=CASE WHEN $3='in_review' THEN current_step+1 ELSE current_step END,
        resolved_by=CASE WHEN $3 IN ('approved','rejected','observed') THEN $4 ELSE resolved_by END,
        resolved_at=CASE WHEN $3 IN ('approved','rejected','observed') THEN NOW() ELSE resolved_at END,resolution_reason=$5,reviewed_documents=$6::jsonb
        WHERE id=$1 AND company_id=$2 RETURNING *`, [id, companyId, nextStatus, userId, reason?.trim() || null, JSON.stringify(reviewedDocumentRows)]);
      await client.query(`UPDATE suppliers SET approval_status=$3,supplier_status=$4,approved_by=CASE WHEN $3='approved' THEN $5 ELSE approved_by END,
        approved_at=CASE WHEN $3='approved' AND $6 THEN NOW() ELSE approved_at END,record_version=record_version+CASE WHEN $7 THEN 1 ELSE 0 END,updated_by=$5,updated_at=NOW()
        WHERE id=$1 AND company_id=$2`, [supplierId, companyId, approvalStatus, supplierStatus, userId,registration,finalApproval]);
      await client.query(`INSERT INTO supplier_approval_decisions(company_id,request_id,supplier_id,decision_by,decision_type,comment,supplier_version,reviewed_documents,result)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[companyId,id,supplierId,userId,decision,reason?.trim()||null,requestRow.record_version,JSON.stringify(reviewedDocumentRows),nextStatus]);
      if(nextStatus==='approved'||nextStatus==='observed'||nextStatus==='rejected'){
        const alertStatus=nextStatus==='approved'?'reviewed':nextStatus==='observed'?'observed':'open';
        await client.query(`UPDATE supplier_risk_alerts SET review_status=$3,review_request_id=CASE WHEN $3='reviewed' THEN review_request_id ELSE NULL END,reviewed_by=$4,reviewed_at=NOW() WHERE company_id=$1 AND supplier_id=$2 AND review_request_id=$5 AND resolved_at IS NULL`,[companyId,supplierId,alertStatus,userId,id]);
      }
      await client.query(`INSERT INTO supplier_events(company_id,supplier_id,event_type,actor_id,notes,after_values)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [companyId, supplierId, nextStatus === 'in_review' ? 'approval_step_completed' : decision, userId, reason?.trim() || null, JSON.stringify(updated.rows[0])]);
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
