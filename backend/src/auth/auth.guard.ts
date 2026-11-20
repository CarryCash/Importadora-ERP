import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Acceso denegado: Se requiere un token de sesión válido');
    }
    
    try {
      const payload = await this.jwtService.verifyAsync(token);
      // Existing signed sessions predate company claims; keep them in the migrated legacy workspace.
      if (!payload.company_id) payload.company_id = '10000000-0000-4000-8000-000000000001';
      const membership = await this.db.query(
        `SELECT m.role, m.company_id, b.id AS branch_id,u.assigned_warehouse_id,
                ARRAY(SELECT bm2.branch_id FROM branch_memberships bm2 JOIN branches br2 ON br2.id=bm2.branch_id WHERE bm2.user_id=u.id AND br2.company_id=m.company_id AND br2.is_active) AS branch_ids
         FROM users u
         JOIN company_memberships m ON m.user_id = u.id AND m.company_id = $2 AND m.is_active = true
         JOIN companies c ON c.id = m.company_id AND c.is_active = true
         LEFT JOIN branches b ON b.id = $3 AND b.company_id = m.company_id AND b.is_active = true
         WHERE u.id = $1 AND u.is_active = true
         LIMIT 1`,
        [payload.sub, payload.company_id, payload.branch_id || null],
      );
      if (!membership.rowCount) throw new UnauthorizedException('La cuenta o su acceso a esta empresa está desactivado.');
      if (payload.sid) {
        const session = await this.db.query(
          `UPDATE user_sessions SET last_seen_at=NOW() WHERE id=$1 AND user_id=$2 AND company_id=$3
             AND revoked_at IS NULL AND expires_at>NOW() RETURNING id`,
          [payload.sid,payload.sub,payload.company_id],
        );
        if (!session.rowCount) throw new UnauthorizedException('La sesión fue cerrada o venció. Inicia sesión nuevamente.');
      }
      const roles = await this.db.query('SELECT role_key FROM company_user_roles WHERE company_id=$1 AND user_id=$2 ORDER BY is_primary DESC',[payload.company_id,payload.sub]);
      const assignedRoles=roles.rows.length?roles.rows.map((row)=>row.role_key as string):[membership.rows[0].role];
      if(!membership.rows[0].branch_id&&!assignedRoles.some((role:string)=>['admin','erp_admin'].includes(role)))throw new UnauthorizedException('Tu usuario no tiene una sucursal autorizada activa. Contacta al administrador.');
      payload.role = membership.rows[0].role;
      payload.roles = assignedRoles;
      payload.company_id = membership.rows[0].company_id;
      payload.branch_id = membership.rows[0].branch_id || null;
      payload.branch_ids = membership.rows[0].branch_ids || [];
      payload.assigned_warehouse_id = membership.rows[0].assigned_warehouse_id || null;
      // Inyectar el payload en el objeto request ("any" casting by bracket notation for JS parity)
      (request as any)['user'] = payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token inválido o expirado');
    }
    
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    // We safely map request.headers if accessing array-like properties
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
