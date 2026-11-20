import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

type Principal = { sub?: string; role?: string; company_id?: string };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: Principal }>();
    const user = request.user;
    if (!user?.sub || !user.role || !user.company_id) {
      throw new ForbiddenException('La sesión no tiene un contexto de empresa válido. Cierra sesión e inicia nuevamente.');
    }

    const result = await this.db.query(
      `SELECT 1
       FROM company_user_roles ur
       JOIN role_permissions rp ON rp.company_id = ur.company_id AND rp.role = ur.role_key
       WHERE ur.user_id = $1 AND ur.company_id = $2
         AND rp.permission_key = $3 AND rp.allowed = true
       LIMIT 1`,
      [user.sub, user.company_id, required[0]],
    );
    if (!result.rowCount) throw new ForbiddenException('No tienes permiso para realizar esta acción.');
    return true;
  }
}
