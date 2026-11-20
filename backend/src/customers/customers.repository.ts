import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CustomersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll(companyId:string,filters:any={}) {
    const page=Math.max(1,Number(filters.page)||1),pageSize=Math.min(100,Math.max(1,Number(filters.pageSize)||25));
    const params=[companyId,String(filters.search||'').trim(),filters.status||'active',filters.type||'all',filters.province||'all',filters.city||'all',filters.balance||'all',pageSize,(page-1)*pageSize];
    const res = await this.db.query(`
      SELECT 
        c.*,
        (SELECT MAX(sale_date) FROM sales WHERE customer_id = c.id AND company_id=c.company_id AND status != 'cancelled') as last_order_date,
        COALESCE((
          SELECT SUM(GREATEST(s.total_amount-COALESCE(p.paid_amount,0),0)) FROM sales s
          LEFT JOIN (SELECT sale_id,SUM(amount) paid_amount FROM sale_payments GROUP BY sale_id) p ON p.sale_id=s.id
          WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.status!='cancelled'
        ),0)::numeric(14,2) as balance,
        COALESCE((SELECT COUNT(*) FROM sales s WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.status!='cancelled' AND s.payment_status!='paid' AND s.sale_date<CURRENT_DATE),0)::int overdue_count
      FROM customers c 
      WHERE c.company_id=$1 AND ($2='' OR CONCAT_WS(' ',c.code,c.name,c.business_name,c.trade_name,c.identification_number,c.phone,c.email) ILIKE '%'||$2||'%')
        AND ($3='all' OR c.is_active=($3='active')) AND ($4='all' OR c.customer_type=$4)
        AND ($5='all' OR c.province=$5) AND ($6='all' OR c.city=$6)
        AND ($7='all' OR ($7='debt' AND EXISTS(SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.payment_status!='paid' AND s.status!='cancelled'))
          OR ($7='overdue' AND EXISTS(SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.payment_status!='paid' AND s.sale_date<CURRENT_DATE AND s.status!='cancelled'))
          OR ($7='clear' AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.payment_status!='paid' AND s.status!='cancelled')))
      ORDER BY c.created_at DESC LIMIT $8 OFFSET $9
    `,params);
    const count=await this.db.query(`SELECT COUNT(*)::int total FROM customers c WHERE c.company_id=$1 AND ($2='' OR CONCAT_WS(' ',c.code,c.name,c.business_name,c.trade_name,c.identification_number,c.phone,c.email) ILIKE '%'||$2||'%') AND ($3='all' OR c.is_active=($3='active')) AND ($4='all' OR c.customer_type=$4) AND ($5='all' OR c.province=$5) AND ($6='all' OR c.city=$6)
      AND ($7='all' OR ($7='debt' AND EXISTS(SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.payment_status!='paid' AND s.status!='cancelled')) OR ($7='overdue' AND EXISTS(SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.payment_status!='paid' AND s.sale_date<CURRENT_DATE AND s.status!='cancelled')) OR ($7='clear' AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.payment_status!='paid' AND s.status!='cancelled')))`,params.slice(0,7));
    return {items:res.rows,total:count.rows[0].total,page,pageSize};
  }

  async getStatement(companyId:string,id: string) {
    const res = await this.db.query(`
      SELECT 
        s.id, s.sale_number, s.sale_date, s.total_amount, s.payment_status,
        COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = s.id), 0) as paid_amount
      FROM sales s
      WHERE s.customer_id = $1 AND s.company_id=$2 AND s.status != 'cancelled' AND s.payment_status != 'paid'
      ORDER BY s.sale_date ASC
    `, [id,companyId]);
    return res.rows;
  }

  async findById(companyId:string,id: string) {
    const res=await this.db.query(`SELECT c.*,
      COALESCE((SELECT SUM(GREATEST(s.total_amount-COALESCE(p.paid,0),0)) FROM sales s LEFT JOIN (SELECT sale_id,SUM(amount) paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id=s.id WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.status!='cancelled'),0)::numeric(14,2) balance,
      COALESCE((SELECT SUM(GREATEST(s.total_amount-COALESCE(p.paid,0),0)) FROM sales s LEFT JOIN (SELECT sale_id,SUM(amount) paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id=s.id WHERE s.customer_id=c.id AND s.company_id=c.company_id AND s.status!='cancelled' AND s.sale_date<CURRENT_DATE AND s.payment_status!='paid'),0)::numeric(14,2) overdue_balance,
      COALESCE((SELECT json_agg(x ORDER BY x.is_primary DESC,x.full_name) FROM customer_contacts x WHERE x.customer_id=c.id AND x.company_id=c.company_id AND x.is_active),'[]') contacts,
      COALESCE((SELECT json_agg(x ORDER BY x.is_billing_default DESC,x.is_delivery_default DESC,x.created_at) FROM customer_addresses x WHERE x.customer_id=c.id AND x.company_id=c.company_id AND x.is_active),'[]') addresses,
      COALESCE((SELECT json_agg(x ORDER BY x.created_at DESC) FROM customer_credit_history x WHERE x.customer_id=c.id AND x.company_id=c.company_id),'[]') credit_history,
      COALESCE((SELECT json_agg(x ORDER BY x.created_at DESC) FROM customer_activity x WHERE x.customer_id=c.id AND x.company_id=c.company_id),'[]') activity
      ,COALESCE((SELECT json_agg(s ORDER BY s.sale_date DESC) FROM (SELECT id,sale_number,sale_date,status,payment_status,total_amount FROM sales WHERE customer_id=c.id AND company_id=c.company_id ORDER BY sale_date DESC LIMIT 50) s),'[]') sales,
      COALESCE((SELECT json_agg(x ORDER BY x.requested_at DESC) FROM customer_credit_requests x WHERE x.customer_id=c.id AND x.company_id=c.company_id),'[]') credit_requests
      FROM customers c WHERE c.company_id=$1 AND c.id=$2`,[companyId,id]);
    if(!res.rowCount)throw new NotFoundException('Cliente no encontrado.');
    return res.rows[0];
  }

  async create(companyId:string,userId:string,customer: any) {
    const { 
      name, email, phone, address, 
      identification_type, identification_number, business_name,
      customer_type, credit_limit, payment_terms, province, city, sri_regime,
      price_list_level, default_discount, visit_days, latitude, longitude, special_notes
    } = customer;
    
    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');
    const idType=String(identification_type||'OTHER').toUpperCase(),idNumber=String(identification_number||'').trim().toUpperCase();
    if(idNumber){await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`customer-id-${companyId}-${idType}-${idNumber}`]);const duplicate=await client.query('SELECT id FROM customers WHERE company_id=$1 AND identification_type=$2 AND upper(identification_number)=$3 FOR UPDATE',[companyId,idType,idNumber]);if(duplicate.rowCount)throw new ConflictException('Ya existe un cliente con esa identificación en esta empresa.');}
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`customer-code-${companyId}`]);
    const codeResult=await client.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(code,'[^0-9]','','g'),'')::bigint),0)+1 code FROM customers WHERE company_id=$1",[companyId]);
    const code=`CLI-${String(codeResult.rows[0].code).padStart(6,'0')}`;
    const res = await client.query(
      `INSERT INTO customers (
        name, email, phone, address, 
        identification_type, identification_number, business_name,
        customer_type, credit_limit, payment_terms, province, city, sri_regime,
        price_list_level, default_discount, visit_days, latitude, longitude, special_notes,company_id,code,party_type,trade_name,country_code,legal_representative,is_active,branch_id
      ) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,$9,$10,$11,$12,0,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,true,$23) 
       RETURNING *`,
      [
        name, email, phone, address, 
        idType, idNumber, business_name,
        customer_type,
        province, city, sri_regime,
        price_list_level || 'Público', visit_days,
        latitude || null, longitude || null, special_notes,
        companyId,code,customer.party_type||'natural',customer.trade_name||null,customer.country_code||'EC',customer.legal_representative||null,customer.branch_id||null
      ]
    );
    const saved=res.rows[0];
    if(email||phone){await client.query(`INSERT INTO customer_contacts(company_id,customer_id,full_name,email,phone,is_primary,contact_type) VALUES($1,$2,$3,$4,$5,true,'general')`,[companyId,saved.id,name,email||null,phone||null]);}
    if(address||province||city){await client.query(`INSERT INTO customer_addresses(company_id,customer_id,address_type,label,country_code,province,canton,city,street,is_billing_default,is_delivery_default) VALUES($1,$2,'main','Principal',$3,$4,$4,$5,$6,true,true)`,[companyId,saved.id,customer.country_code||'EC',province||null,city||null,address||null]);}
    await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,created_by) VALUES($1,$2,'created','Cliente registrado',$3)`,[companyId,saved.id,userId||null]);await client.query('COMMIT');return saved;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async update(companyId:string,userId:string,id: string, customer: any) {
    const { 
      name, email, phone, address, 
      identification_type, identification_number, business_name,
      customer_type, credit_limit, payment_terms, province, city, sri_regime,
      price_list_level, default_discount, visit_days, latitude, longitude, special_notes
    } = customer;

    const client=await this.db.getPool().connect();
    try{await client.query('BEGIN');
    const normalizedType=identification_type?String(identification_type).toUpperCase():null,normalizedNumber=identification_number?String(identification_number).trim().toUpperCase():null;
    if(normalizedNumber){await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`customer-id-${companyId}-${normalizedType}-${normalizedNumber}`]);const duplicate=await client.query('SELECT id FROM customers WHERE company_id=$1 AND identification_type=$2 AND upper(identification_number)=$3 AND id<>$4',[companyId,normalizedType,normalizedNumber,id]);if(duplicate.rowCount)throw new ConflictException('Ya existe otro cliente con esa identificación en esta empresa.');}

    const res = await client.query(
      `UPDATE customers SET 
        name = COALESCE($1, name), 
        email = COALESCE($2, email), 
        phone = COALESCE($3, phone), 
        address = COALESCE($4, address),
        identification_type = COALESCE($5, identification_type),
        identification_number = COALESCE($6, identification_number),
        business_name = COALESCE($7, business_name),
        customer_type = COALESCE($8, customer_type),
        credit_limit = credit_limit,
        payment_terms = payment_terms,
        province = COALESCE($9, province),
        city = COALESCE($10, city),
        sri_regime = COALESCE($11, sri_regime),
        price_list_level = COALESCE($12, price_list_level),
        default_discount = COALESCE($13, default_discount),
        visit_days = COALESCE($14, visit_days),
        latitude = COALESCE($15, latitude),
        longitude = COALESCE($16, longitude),
        special_notes = COALESCE($17, special_notes),
        party_type=COALESCE($18,party_type),trade_name=COALESCE($19,trade_name),country_code=COALESCE($20,country_code),legal_representative=COALESCE($21,legal_representative),
        updated_at = CURRENT_TIMESTAMP
      WHERE company_id=$22 AND id = $23 RETURNING *`,
      [
        name, email, phone, address, 
        normalizedType, normalizedNumber, business_name,
        customer_type, province, city, sri_regime,
        price_list_level, default_discount, visit_days,
        latitude, longitude, special_notes,customer.party_type,customer.trade_name,customer.country_code,customer.legal_representative,
        companyId,id
      ]
    );
    if(!res.rowCount)throw new NotFoundException('Cliente no encontrado.');
    await client.query(`UPDATE customer_contacts SET full_name=COALESCE($3,full_name),email=COALESCE($4,email),phone=COALESCE($5,phone),updated_at=NOW() WHERE company_id=$1 AND customer_id=$2 AND is_primary AND is_active`,[companyId,id,name,email,phone]);
    await client.query(`UPDATE customer_addresses SET street=COALESCE($3,street),province=COALESCE($4,province),canton=COALESCE($4,canton),city=COALESCE($5,city),updated_at=NOW() WHERE company_id=$1 AND customer_id=$2 AND (is_billing_default OR is_delivery_default) AND is_active`,[companyId,id,address,province,city]);
    await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,created_by) VALUES($1,$2,'updated','Datos generales actualizados',$3)`,[companyId,id,userId||null]);
    await client.query('COMMIT');return res.rows[0];
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async delete(companyId:string,userId:string,id: string) {
    const result=await this.db.query(`UPDATE customers SET is_active=false,updated_at=NOW() WHERE company_id=$1 AND id=$2 AND is_active=true RETURNING id`,[companyId,id]);
    if(!result.rowCount)throw new NotFoundException('Cliente activo no encontrado.');
    await this.db.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,created_by) VALUES($1,$2,'deactivated','Cliente desactivado; historial conservado',$3)`,[companyId,id,userId||null]);
    return {success:true,is_active:false};
  }

  async changeCredit(companyId:string,userId:string,id:string,data:any){const client=await this.db.getPool().connect();try{await client.query('BEGIN');const c=await client.query('SELECT * FROM customers WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,id]);if(!c.rowCount)throw new NotFoundException('Cliente no encontrado.');const limit=Number(data.credit_limit),terms=Number(data.payment_terms);if(!Number.isFinite(limit)||limit<0||!Number.isInteger(terms)||terms<0||terms>365||!String(data.reason||'').trim())throw new BadRequestException('Indica cupo, plazo entre 0 y 365 días y motivo.');const old=c.rows[0];await client.query('UPDATE customers SET credit_limit=$1,payment_terms=$2,credit_review_date=CURRENT_DATE,updated_at=NOW() WHERE id=$3',[limit,terms,id]);await client.query('INSERT INTO customer_credit_history(company_id,customer_id,previous_limit,new_limit,previous_terms,new_terms,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[companyId,id,old.credit_limit,limit,old.payment_terms,terms,String(data.reason).trim(),userId||null]);await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,details,created_by) VALUES($1,$2,'credit_changed','Condiciones de crédito modificadas',$3::jsonb,$4)`,[companyId,id,JSON.stringify({previous_limit:old.credit_limit,new_limit:limit,previous_terms:old.payment_terms,new_terms:terms}),userId||null]);await client.query('COMMIT');return this.findById(companyId,id);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async requestCredit(companyId:string,userId:string,id:string,data:any){const client=await this.db.getPool().connect();try{await client.query('BEGIN');const customer=await client.query('SELECT * FROM customers WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,id]);if(!customer.rowCount)throw new NotFoundException('Cliente no encontrado.');const limit=Number(data.credit_limit),terms=Number(data.payment_terms);if(!Number.isFinite(limit)||limit<0||!Number.isInteger(terms)||terms<0||terms>365||!String(data.reason||'').trim())throw new BadRequestException('Indica cupo, plazo entre 0 y 365 días y motivo.');const pending=await client.query("SELECT id FROM customer_credit_requests WHERE company_id=$1 AND customer_id=$2 AND status='pending' FOR UPDATE",[companyId,id]);if(pending.rowCount)throw new ConflictException('El cliente ya tiene una solicitud de crédito pendiente.');const old=customer.rows[0];const created=await client.query(`INSERT INTO customer_credit_requests(company_id,customer_id,previous_limit,requested_limit,previous_terms,requested_terms,reason,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[companyId,id,old.credit_limit,limit,old.payment_terms,terms,String(data.reason).trim(),userId||null]);await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,details,created_by) VALUES($1,$2,'credit_requested','Cambio de crédito enviado a aprobación',$3::jsonb,$4)`,[companyId,id,JSON.stringify({request_id:created.rows[0].id,requested_limit:limit,requested_terms:terms}),userId||null]);await client.query('COMMIT');return created.rows[0];}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async reviewCreditRequest(companyId:string,reviewerId:string,id:string,requestId:string,data:any){const client=await this.db.getPool().connect();try{await client.query('BEGIN');const request=await client.query(`SELECT r.*,c.credit_limit current_limit,c.payment_terms current_terms FROM customer_credit_requests r JOIN customers c ON c.id=r.customer_id AND c.company_id=r.company_id WHERE r.company_id=$1 AND r.customer_id=$2 AND r.id=$3 FOR UPDATE OF r,c`,[companyId,id,requestId]);if(!request.rowCount)throw new NotFoundException('Solicitud de crédito no encontrada.');const row=request.rows[0];if(row.status!=='pending')throw new ConflictException('La solicitud ya fue revisada.');if(row.requested_by===reviewerId)throw new ConflictException('La solicitud debe revisarla otra persona autorizada.');if(!['approved','rejected'].includes(data.decision))throw new BadRequestException('Selecciona aprobar o rechazar.');if(data.decision==='approved'){await client.query('UPDATE customers SET credit_limit=$1,payment_terms=$2,credit_review_date=CURRENT_DATE,updated_at=NOW() WHERE id=$3 AND company_id=$4',[row.requested_limit,row.requested_terms,id,companyId]);await client.query('INSERT INTO customer_credit_history(company_id,customer_id,previous_limit,new_limit,previous_terms,new_terms,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[companyId,id,row.current_limit,row.requested_limit,row.current_terms,row.requested_terms,row.reason,reviewerId]);}const reviewed=await client.query(`UPDATE customer_credit_requests SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=NOW() WHERE id=$4 AND company_id=$5 RETURNING *`,[data.decision,reviewerId,data.review_note||null,requestId,companyId]);await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,details,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,[companyId,id,`credit_${data.decision}`,data.decision==='approved'?'Solicitud de crédito aprobada':'Solicitud de crédito rechazada',JSON.stringify({request_id:requestId,review_note:data.review_note||null}),reviewerId]);await client.query('COMMIT');return reviewed.rows[0];}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async createContact(companyId:string,userId:string,customerId:string,data:any){const client=await this.db.getPool().connect();try{await client.query('BEGIN');const owner=await client.query('SELECT id FROM customers WHERE id=$1 AND company_id=$2',[customerId,companyId]);if(!owner.rowCount)throw new NotFoundException('Cliente no encontrado.');if(data.is_primary)await client.query('UPDATE customer_contacts SET is_primary=false WHERE company_id=$1 AND customer_id=$2',[companyId,customerId]);const row=await client.query(`INSERT INTO customer_contacts(company_id,customer_id,full_name,department,job_title,phone,phone_extension,email,preferred_channel,contact_type,is_primary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[companyId,customerId,String(data.full_name||'').trim(),data.department||null,data.job_title||null,data.phone||null,data.phone_extension||null,data.email||null,data.preferred_channel||null,data.contact_type||'general',!!data.is_primary]);await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,created_by) VALUES($1,$2,'contact_added','Contacto agregado: '||$3,$4)`,[companyId,customerId,row.rows[0].full_name,userId||null]);await client.query('COMMIT');return row.rows[0];}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async createAddress(companyId:string,userId:string,customerId:string,data:any){const client=await this.db.getPool().connect();try{await client.query('BEGIN');const owner=await client.query('SELECT id FROM customers WHERE id=$1 AND company_id=$2',[customerId,companyId]);if(!owner.rowCount)throw new NotFoundException('Cliente no encontrado.');if(data.is_billing_default)await client.query('UPDATE customer_addresses SET is_billing_default=false WHERE company_id=$1 AND customer_id=$2',[companyId,customerId]);if(data.is_delivery_default)await client.query('UPDATE customer_addresses SET is_delivery_default=false WHERE company_id=$1 AND customer_id=$2',[companyId,customerId]);const row=await client.query(`INSERT INTO customer_addresses(company_id,customer_id,address_type,label,country_code,province,canton,city,postal_code,street,street_number,intersection,reference,delivery_instructions,is_billing_default,is_delivery_default) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,[companyId,customerId,data.address_type||'other',data.label||null,data.country_code||'EC',data.province||null,data.canton||null,data.city||null,data.postal_code||null,data.street||null,data.street_number||null,data.intersection||null,data.reference||null,data.delivery_instructions||null,!!data.is_billing_default,!!data.is_delivery_default]);await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,created_by) VALUES($1,$2,'address_added','Dirección agregada: '||COALESCE($3,'sin etiqueta'),$4)`,[companyId,customerId,data.label||null,userId||null]);await client.query('COMMIT');return row.rows[0];}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async updateContact(companyId:string,userId:string,customerId:string,contactId:string,data:any){const client=await this.db.getPool().connect();try{await client.query('BEGIN');const contact=await client.query('SELECT * FROM customer_contacts WHERE id=$1 AND customer_id=$2 AND company_id=$3 AND is_active FOR UPDATE',[contactId,customerId,companyId]);if(!contact.rowCount)throw new NotFoundException('Contacto activo no encontrado.');if(data.is_primary)await client.query('UPDATE customer_contacts SET is_primary=false WHERE customer_id=$1 AND company_id=$2',[customerId,companyId]);const fields=['full_name','department','job_title','phone','phone_extension','email','preferred_channel','contact_type','is_primary'];const keys=fields.filter(k=>data[k]!==undefined);if(!keys.length)throw new BadRequestException('No hay campos de contacto para actualizar.');const updated=await client.query(`UPDATE customer_contacts SET ${keys.map((k,i)=>`${k}=$${i+3}`).join(',')},updated_at=NOW() WHERE id=$1 AND customer_id=$2 AND company_id=$${keys.length+3} RETURNING *`,[contactId,customerId,...keys.map(k=>data[k]),companyId]);await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,created_by) VALUES($1,$2,'contact_updated','Contacto actualizado: '||$3,$4)`,[companyId,customerId,updated.rows[0].full_name,userId||null]);await client.query('COMMIT');return updated.rows[0];}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async updateAddress(companyId:string,userId:string,customerId:string,addressId:string,data:any){const client=await this.db.getPool().connect();try{await client.query('BEGIN');const address=await client.query('SELECT * FROM customer_addresses WHERE id=$1 AND customer_id=$2 AND company_id=$3 AND is_active FOR UPDATE',[addressId,customerId,companyId]);if(!address.rowCount)throw new NotFoundException('Dirección activa no encontrada.');await client.query('SELECT id FROM customers WHERE id=$1 AND company_id=$2 FOR UPDATE',[customerId,companyId]);if(data.is_billing_default)await client.query('UPDATE customer_addresses SET is_billing_default=false WHERE customer_id=$1 AND company_id=$2',[customerId,companyId]);if(data.is_delivery_default)await client.query('UPDATE customer_addresses SET is_delivery_default=false WHERE customer_id=$1 AND company_id=$2',[customerId,companyId]);const fields=['address_type','label','country_code','province','canton','city','postal_code','street','street_number','intersection','reference','delivery_instructions','is_billing_default','is_delivery_default'];const keys=fields.filter(k=>data[k]!==undefined);if(!keys.length)throw new BadRequestException('No hay campos de dirección para actualizar.');const updated=await client.query(`UPDATE customer_addresses SET ${keys.map((k,i)=>`${k}=$${i+3}`).join(',')},updated_at=NOW() WHERE id=$1 AND customer_id=$2 AND company_id=$${keys.length+3} RETURNING *`,[addressId,customerId,...keys.map(k=>data[k]),companyId]);await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,created_by) VALUES($1,$2,'address_updated','Dirección actualizada: '||COALESCE($3,'sin etiqueta'),$4)`,[companyId,customerId,updated.rows[0].label,userId||null]);await client.query('COMMIT');return updated.rows[0];}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async deactivateRelationship(companyId:string,userId:string,customerId:string,relationship:'contact'|'address',recordId:string){const table=relationship==='contact'?'customer_contacts':'customer_addresses';const setFields=relationship==='contact'?'is_active=false,is_primary=false,updated_at=NOW()':'is_active=false,is_billing_default=false,is_delivery_default=false,updated_at=NOW()';const returnFields=relationship==='contact'?'full_name':'label';const client=await this.db.getPool().connect();try{await client.query('BEGIN');const result=await client.query(`UPDATE ${table} SET ${setFields} WHERE id=$1 AND customer_id=$2 AND company_id=$3 AND is_active RETURNING ${returnFields}`,[recordId,customerId,companyId]);if(!result.rowCount)throw new NotFoundException('Registro activo no encontrado.');await client.query(`INSERT INTO customer_activity(company_id,customer_id,event_type,description,created_by) VALUES($1,$2,$3,$4,$5)`,[companyId,customerId,`${relationship}_deactivated`,`${relationship==='contact'?'Contacto':'Dirección'} desactivado: ${result.rows[0][returnFields]||''}`,userId||null]);await client.query('COMMIT');return {success:true,is_active:false};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}

  async getAnalytics(companyId:string){const [summary,debtors,topCustomers,inactiveCustomers]=await Promise.all([
    this.db.query(`SELECT COUNT(DISTINCT c.id)::int customer_count,COUNT(DISTINCT c.id) FILTER(WHERE c.created_at>=DATE_TRUNC('month',CURRENT_DATE))::int new_this_month,COALESCE(SUM(GREATEST(s.total_amount-COALESCE(p.paid,0),0)),0)::numeric(14,2) receivables,COUNT(DISTINCT c.id) FILTER(WHERE s.payment_status!='paid' AND s.sale_date<CURRENT_DATE)::int overdue_customers FROM customers c LEFT JOIN sales s ON s.customer_id=c.id AND s.company_id=c.company_id AND s.status!='cancelled' LEFT JOIN (SELECT sale_id,SUM(amount) paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id=s.id WHERE c.company_id=$1 AND c.is_active`,[companyId]),
    this.db.query(`SELECT c.name,SUM(GREATEST(s.total_amount-COALESCE(p.paid,0),0)) total_debt FROM customers c JOIN sales s ON s.customer_id=c.id AND s.company_id=c.company_id LEFT JOIN (SELECT sale_id,SUM(amount) paid FROM sale_payments GROUP BY sale_id) p ON p.sale_id=s.id WHERE c.company_id=$1 AND s.status!='cancelled' GROUP BY c.id,c.name ORDER BY total_debt DESC LIMIT 5`,[companyId]),
    this.db.query(`SELECT c.name,SUM(s.total_amount) total_spent FROM customers c JOIN sales s ON s.customer_id=c.id AND s.company_id=c.company_id WHERE c.company_id=$1 AND s.status!='cancelled' GROUP BY c.id,c.name ORDER BY total_spent DESC LIMIT 5`,[companyId]),
    this.db.query(`SELECT c.name,MAX(s.sale_date) last_purchase FROM customers c LEFT JOIN sales s ON s.customer_id=c.id AND s.company_id=c.company_id AND s.status!='cancelled' WHERE c.company_id=$1 AND c.is_active GROUP BY c.id,c.name HAVING MAX(s.sale_date)<CURRENT_DATE-INTERVAL '60 days' OR MAX(s.sale_date) IS NULL ORDER BY last_purchase ASC NULLS FIRST LIMIT 5`,[companyId])
  ]);return {summary:summary.rows[0],debtors:debtors.rows,topCustomers:topCustomers.rows,inactiveCustomers:inactiveCustomers.rows};}

  async exportCsv(companyId:string){const result=await this.db.query(`SELECT code,party_type,identification_type,identification_number,name,business_name,trade_name,email,phone,country_code,province,city,address,customer_type,price_list_level,credit_limit,payment_terms,is_active,created_at FROM customers WHERE company_id=$1 ORDER BY code`,[companyId]);const columns=['code','party_type','identification_type','identification_number','name','business_name','trade_name','email','phone','country_code','province','city','address','customer_type','price_list_level','credit_limit','payment_terms','is_active','created_at'];const escape=(value:any)=>`"${String(value??'').replaceAll('"','""')}"`;return '\uFEFF'+[columns.join(','),...result.rows.map((row:any)=>columns.map(column=>escape(row[column])).join(','))].join('\r\n');}

  parseCsv(csv:string){const source=String(csv||'').replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],field='',quoted=false;for(let i=0;i<source.length;i++){const ch=source[i];if(quoted){if(ch==='"'&&source[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(field);field='';}else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=ch;}if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}if(rows.length<2)throw new BadRequestException('El CSV debe incluir encabezados y al menos un cliente.');const headers=rows[0].map(x=>x.trim().toLowerCase());if(!headers.includes('name'))throw new BadRequestException('El CSV debe incluir la columna name.');return rows.slice(1).filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(headers.map((header,index)=>[header,r[index]??''])));}
}
