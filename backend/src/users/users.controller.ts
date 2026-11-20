import { Controller, Get, Post, Body, Put, Param, UseGuards, Patch, Req } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';

@Controller('api/users')
@UseGuards(RolesGuard)
@Roles('admin', 'erp_admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Roles('admin', 'erp_admin', 'sales', 'warehouse', 'user')
  @Permissions('users.profile')
  getMyProfile(@Req() request: Request & { user?: { sub: string } }) {
    return this.usersService.getProfile(request.user?.sub || '');
  }

  @Patch('me')
  @Roles('admin', 'erp_admin', 'sales', 'warehouse', 'user')
  @Permissions('users.profile')
  updateMyProfile(
    @Req() request: Request & { user?: { sub: string } },
    @Body() profileDto: { full_name?: string; email?: string; current_password?: string; new_password?: string },
  ) {
    return this.usersService.updateProfile(request.user?.sub || '', profileDto);
  }

  @Get()
  @Permissions('users.read')
  findAll(@Req() request: Request & { user?: { company_id: string } }) {
    return this.usersService.findAll(request.user?.company_id || '');
  }

  @Post()
  @Permissions('users.manage')
  create(@Body() userDto: any, @Req() request: Request & { user?: { company_id: string } }) {
    return this.usersService.create(request.user?.company_id || '', userDto);
  }

  @Put(':id')
  @Permissions('users.manage')
  update(@Param('id') id: string, @Body() userDto: any, @Req() request: Request & { user?: { company_id: string } }) {
    return this.usersService.update(request.user?.company_id || '', id, userDto);
  }

  @Get(':id')
  @Permissions('users.read')
  findById(@Param('id') id: string, @Req() request: Request & { user?: { company_id: string } }) {
    return this.usersService.findById(id, request.user?.company_id);
  }
}

