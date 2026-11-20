import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyRepository } from './company.repository';

const allowedModules = new Set([
  'dashboard', 'logistics', 'products', 'inventory', 'sales', 'imports',
  'customers', 'suppliers', 'finance', 'users',
]);

@Injectable()
export class CompanyService {
  constructor(private readonly repository: CompanyRepository) {}

  async getSettings(companyId: string) {
    const settings = await this.repository.getSettings(companyId);
    if (!settings) throw new NotFoundException('No se encontró la empresa activa.');
    return settings;
  }

  async updateSettings(companyId: string, actorId: string, input: Record<string, unknown>) {
    const companyName = typeof input.companyName === 'string' ? input.companyName.trim() : '';
    if (!companyName || companyName.length > 120) {
      throw new BadRequestException('El nombre de la empresa es obligatorio y debe tener hasta 120 caracteres.');
    }

    const brandColor = typeof input.brandColor === 'string' ? input.brandColor : '#064035';
    if (!/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
      throw new BadRequestException('El color de marca debe ser un color hexadecimal válido.');
    }

    const actionColor = typeof input.actionColor === 'string' ? input.actionColor : '#17365D';
    if (!/^#[0-9a-fA-F]{6}$/.test(actionColor)) {
      throw new BadRequestException('El color de los botones debe ser un color hexadecimal válido.');
    }

    const logoDataUrl = typeof input.logoDataUrl === 'string' ? input.logoDataUrl : '';
    const validLogo = logoDataUrl === '' || /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logoDataUrl);
    if (!validLogo || logoDataUrl.length > 1_450_000) {
      throw new BadRequestException('El logotipo debe ser una imagen PNG, JPG, WEBP o SVG menor a 1 MB.');
    }

    const requestedModules = Array.isArray(input.enabledModules) ? input.enabledModules : [];
    if (requestedModules.some((module) => typeof module !== 'string' || !allowedModules.has(module))) {
      throw new BadRequestException('La lista contiene un módulo no permitido.');
    }
    const enabledModules = [...new Set(['dashboard', ...requestedModules])];

    const updated = await this.repository.updateSettings(companyId, actorId, companyName, {
      logoDataUrl,
      brandColor,
      actionColor,
      enabledModules,
    });
    if (!updated) throw new NotFoundException('No se encontró la empresa activa.');
    return updated;
  }

  async getRolePermissions(companyId: string) {
    return this.repository.getRolePermissions(companyId);
  }

  async getRoles(companyId: string) {
    return this.repository.getRoles(companyId);
  }

  async roleExists(companyId: string, roleKey: string) {
    return this.repository.roleExists(companyId, roleKey);
  }

  async createRole(companyId: string, input: { role_key?: unknown; display_name?: unknown; description?: unknown }) {
    const roleKey = typeof input.role_key === 'string' ? input.role_key.trim().toLowerCase() : '';
    const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(roleKey)) throw new BadRequestException('El código debe tener 2–30 caracteres: minúsculas, números o guion bajo.');
    if (!displayName || displayName.length > 80 || description.length > 240) throw new BadRequestException('Indica un nombre de hasta 80 caracteres y una descripción de hasta 240.');
    if (['admin', 'sales', 'warehouse', 'user'].includes(roleKey)) throw new ConflictException('Ese código está reservado por un rol del sistema.');
    try {
      return await this.repository.createRole(companyId, roleKey, displayName, description);
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') throw new ConflictException('Ya existe un rol con ese código.');
      throw error;
    }
  }

  async deleteRole(companyId: string, roleKey: string) {
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(roleKey)) throw new BadRequestException('Código de rol no válido.');
    if (['admin', 'sales', 'warehouse', 'user'].includes(roleKey)) throw new BadRequestException('Los roles del sistema no se pueden eliminar.');
    if (await this.repository.hasRoleMembers(companyId, roleKey)) throw new ConflictException('Reasigna primero a los usuarios que tienen este rol.');
    if (!await this.repository.deleteRole(companyId, roleKey)) throw new NotFoundException('No se encontró el rol o no se puede eliminar.');
    return { success: true };
  }

  async updateRolePermissions(companyId: string, role: string, input: unknown) {
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(role) || ['admin'].includes(role)) throw new BadRequestException('Ese rol no se puede modificar desde esta pantalla.');
    if (!Array.isArray(input) || input.some((permission) => typeof permission !== 'string')) {
      throw new BadRequestException('Envía una lista válida de permisos.');
    }
    const allowed = new Set(await this.repository.getPermissionKeys());
    const permissionKeys = [...new Set(input as string[])];
    if (permissionKeys.some((permission) => !allowed.has(permission))) {
      throw new BadRequestException('La lista incluye un permiso desconocido.');
    }
    const fixedAdminPermissions = new Set(['settings.manage', 'users.manage', 'users.read', 'finance.read', 'finance.write']);
    if (role!=='erp_admin'&&permissionKeys.some((permission) => fixedAdminPermissions.has(permission))) {
      throw new BadRequestException('La administración de usuarios, configuración y finanzas está reservada al administrador.');
    }
    return this.repository.updateRolePermissions(companyId, role, permissionKeys);
  }
}
