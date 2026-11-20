import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InvoicesRepository {
  constructor(private readonly db: DatabaseService) {}

  async createInvoice(client: any, invoiceData: {
    sale_id: string;
    company_id: string;
    branch_id: string;
    internal_number: string;
    invoice_number?: string | null;
    authorization_code?: string;
    status: 'not_issued' | 'pending' | 'authorized' | 'rejected' | 'cancelled';
    issued_at?: Date | null;
    xml_data?: string;
  }) {
    const query = `
      INSERT INTO invoices (
        sale_id, company_id, branch_id, internal_number, invoice_number,
        authorization_code, status, issued_at, xml_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const params = [
      invoiceData.sale_id,
      invoiceData.company_id,
      invoiceData.branch_id,
      invoiceData.internal_number,
      invoiceData.invoice_number || null,
      invoiceData.authorization_code || null,
      invoiceData.status,
      invoiceData.issued_at || null,
      invoiceData.xml_data || null
    ];

    const res = await client.query(query, params);
    return res.rows[0];
  }

  // Internal identifiers are deliberately separate from SRI authorization numbers.
  // The counter row is locked/updated atomically within the caller's transaction.
  async generateNextInternalNumber(
    client: any,
    companyId: string,
    branchId: string,
    branchCode: string,
    businessDate: string | Date,
  ): Promise<string> {
    const dateText = businessDate instanceof Date
      ? businessDate.toISOString().slice(0, 10)
      : String(businessDate);
    const yearMatch = /^(\d{4})-\d{2}-\d{2}$/.exec(dateText);
    if (!yearMatch) throw new BadRequestException('La fecha de la venta no es válida para numerar el documento interno.');
    const year = Number(yearMatch[1]);
    if (year < 2000 || year > 9999) throw new BadRequestException('El año de la venta está fuera del rango admitido.');

    const result = await client.query(
      `INSERT INTO invoice_internal_sequences(company_id, branch_id, document_year, last_sequence)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (company_id, branch_id, document_year)
       DO UPDATE SET last_sequence = invoice_internal_sequences.last_sequence + 1,
                     updated_at = NOW()
       RETURNING last_sequence`,
      [companyId, branchId, year],
    );
    const sequence = String(result.rows[0].last_sequence).padStart(8, '0');
    const safeBranchCode = String(branchCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'BRANCH';
    return `INT-${safeBranchCode}-${year}-${sequence}`;
  }
}
