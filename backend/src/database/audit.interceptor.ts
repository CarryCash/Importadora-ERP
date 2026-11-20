import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, concatMap, from, map, throwError } from 'rxjs';
import { DatabaseService } from './database.service';

type AuditRequest = Request & {
  user?: { sub?: string; company_id?: string };
  requestId?: string;
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly db: DatabaseService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuditRequest>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next.handle();

    const path = request.route?.path
      ? `${request.baseUrl}${request.route.path}`
      : request.path.split('?')[0];
    if (path.startsWith('/api/auth/')) return next.handle();

    const auditRecord = (statusCode: number) => this.writeAudit({
      companyId: request.user?.company_id || null,
      actorId: request.user?.sub || null,
      action: method,
      resource: path.slice(0, 240),
      resourceId: String(request.params?.id || request.params?.productId || '').slice(0, 100) || null,
      statusCode,
      requestId: String(request.requestId || request.headers['x-request-id'] || '').slice(0, 100) || null,
      ipAddress: request.ip || null,
    });

    return next.handle().pipe(
      concatMap((value) => from(auditRecord(response.statusCode)).pipe(map(() => value))),
      catchError((error: unknown) => {
        const statusCode = typeof error === 'object' && error !== null && 'getStatus' in error
          ? Number((error as { getStatus: () => number }).getStatus())
          : response.statusCode || 500;
        return from(auditRecord(statusCode)).pipe(concatMap(() => throwError(() => error)));
      }),
    );
  }

  private async writeAudit(record: {
    companyId: string | null;
    actorId: string | null;
    action: string;
    resource: string;
    resourceId: string | null;
    statusCode: number;
    requestId: string | null;
    ipAddress: string | null;
  }) {
    try {
      await this.db.query(
        `INSERT INTO audit_logs (company_id, actor_id, action, resource, resource_id, status_code, request_id, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [record.companyId, record.actorId, record.action, record.resource, record.resourceId, record.statusCode, record.requestId, record.ipAddress],
      );
    } catch (error) {
      // A logging outage must be visible without disguising the result of an operation.
      this.logger.error('No se pudo guardar el registro de auditoría.', error instanceof Error ? error.stack : undefined);
    }
  }
}
