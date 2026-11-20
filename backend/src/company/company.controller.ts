import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CompanyService } from './company.service';
import { Permissions } from '../auth/permissions.decorator';

type AuthenticatedRequest = Request & { user?: { sub: string; company_id?: string } };
const legacyCompanyId = '10000000-0000-4000-8000-000000000001';

@Controller('api/company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get('settings')
  @Permissions('settings.read')
  getSettings(@Req() request: AuthenticatedRequest) {
    return this.companyService.getSettings(request.user?.company_id || legacyCompanyId);
  }

  @Get('roles')
  @UseGuards(RolesGuard)
  @Roles('admin', 'erp_admin')
  @Permissions('settings.manage')
  getRolePermissions(@Req() request: AuthenticatedRequest) {
    return this.companyService.getRolePermissions(request.user?.company_id || legacyCompanyId);
  }

  @Get('roles/catalog')
  @UseGuards(RolesGuard)
  @Roles('admin', 'erp_admin')
  @Permissions('settings.manage')
  getRoles(@Req() request: AuthenticatedRequest) {
    return this.companyService.getRoles(request.user?.company_id || legacyCompanyId);
  }

  @Post('roles')
  @UseGuards(RolesGuard)
  @Roles('admin', 'erp_admin')
  @Permissions('settings.manage')
  createRole(@Req() request: AuthenticatedRequest, @Body() body: { role_key?: unknown; display_name?: unknown; description?: unknown }) {
    return this.companyService.createRole(request.user?.company_id || legacyCompanyId, body);
  }

  @Delete('roles/:role')
  @UseGuards(RolesGuard)
  @Roles('admin', 'erp_admin')
  @Permissions('settings.manage')
  deleteRole(@Req() request: AuthenticatedRequest, @Param('role') role: string) {
    return this.companyService.deleteRole(request.user?.company_id || legacyCompanyId, role);
  }

  @Patch('roles/:role')
  @UseGuards(RolesGuard)
  @Roles('admin', 'erp_admin')
  @Permissions('settings.manage')
  updateRolePermissions(
    @Req() request: AuthenticatedRequest,
    @Param('role') role: string,
    @Body('permissionKeys') permissionKeys: unknown,
  ) {
    return this.companyService.updateRolePermissions(request.user?.company_id || legacyCompanyId, role, permissionKeys);
  }

  @Patch('settings')
  @UseGuards(RolesGuard)
  @Roles('admin', 'erp_admin')
  @Permissions('settings.manage')
  updateSettings(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.companyService.updateSettings(
      request.user?.company_id || legacyCompanyId,
      request.user?.sub || '',
      body,
    );
  }
}

