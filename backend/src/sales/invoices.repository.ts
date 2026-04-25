import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InvoicesRepository {
  constructor(private readonly db: DatabaseService) {}

  async createInvoice(client: any, invoiceData: {
    sale_id: string;
    invoice_number: string;
    authorization_code?: string;
    status: 'pending' | 'authorized' | 'rejected' | 'cancelled';
    issued_at: Date;
    xml_data?: string;
  }) {
    const query = `
      INSERT INTO invoices (
        sale_id, invoice_number, authorization_code, status, 
        issued_at, xml_data
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const params = [
      invoiceData.sale_id,
      invoiceData.invoice_number,
      invoiceData.authorization_code || null,
      invoiceData.status,
      invoiceData.issued_at,
      invoiceData.xml_data || null
    ];

    const res = await client.query(query, params);
    return res.rows[0];
  }

  // Generador de secuencial para SRI (Ej: 001-001-000000001)
  async generateNextInvoiceNumber(client: any): Promise<string> {
    const res = await client.query(`SELECT COUNT(*) as total FROM invoices`);
    const nextSeq = (parseInt(res.rows[0].total, 10) + 1).toString().padStart(9, '0');
    return `001-001-${nextSeq}`;
  }
}
