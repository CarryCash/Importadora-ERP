import { Injectable, ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import * as bcrypt from 'bcryptjs';
import { CompanyService } from '../company/company.service';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository, private readonly companyService: CompanyService) {}

  async findAll(companyId: string) {
    return this.repository.findAll(companyId);
  }

  async findByUsername(username: string) {
    return this.repository.findByUsername(username);
  }

  async findDefaultMembership(userId: string) {
    return this.repository.findDefaultMembership(userId);
  }

  async findPermissions(companyId: string, role: string) {
    return this.repository.findPermissions(companyId, role);
  }

  async findCompanyRoles(companyId: string,userId: string) { return this.repository.findCompanyRoles(companyId,userId); }
  async findCompanyPermissions(companyId: string,userId: string) { return this.repository.findCompanyPermissions(companyId,userId); }
  async createSession(session: {id:string;companyId:string;userId:string;ip?:string;userAgent?:string;expiresAt:Date}) { return this.repository.createSession(session); }
  async revokeSession(sessionId:string,userId:string) { return this.repository.revokeSession(sessionId,userId); }
  async revokeUserSessions(companyId:string,userId:string){return this.repository.revokeUserSessions(companyId,userId);}
  async recordLoginAttempt(username:string,ip:string|undefined,succeeded:boolean,companyId?:string) { return this.repository.recordLoginAttempt(username,ip,succeeded,companyId); }
  async markLogin(userId:string){return this.repository.markLogin(userId);}
  async isLoginLocked(username:string,companyId:string) { return this.repository.isLoginLocked(username,companyId); }
  async getSecurityPolicy(companyId:string) { return this.repository.getSecurityPolicy(companyId); }
  async validOrgAssignment(companyId:string,departmentId?:string,positionId?:string){return this.repository.validOrgAssignment(companyId,departmentId,positionId);}
  async validWarehouseAssignment(companyId:string,warehouseId?:string){return this.repository.validWarehouseAssignment(companyId,warehouseId);}

  async findById(id: string, companyId?: string) {
    return this.repository.findById(id, companyId);
  }

  async getProfile(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new BadRequestException('No se encontró el perfil del usuario.');
    const { password_hash: _passwordHash, ...profile } = user;
    return profile;
  }

  async updateProfile(id: string, profile: { full_name?: string; email?: string; current_password?: string; new_password?: string }) {
    const user = await this.repository.findById(id);
    if (!user) throw new BadRequestException('No se encontró el perfil del usuario.');

    const fullName = profile.full_name?.trim();
    const email = profile.email?.trim().toLowerCase();
    if (!fullName || !email) throw new BadRequestException('El nombre y correo son obligatorios.');
    if (profile.new_password) {
      const membership=await this.repository.findDefaultMembership(id),policy=membership?.company_id?await this.repository.getSecurityPolicy(membership.company_id):null;
      if (profile.new_password.length < Number(policy?.min_password_length||10)) throw new BadRequestException(`La nueva contraseña debe tener al menos ${policy?.min_password_length||10} caracteres.`);
      if (!profile.current_password || !await bcrypt.compare(profile.current_password, user.password_hash)) {
        throw new UnauthorizedException('La contraseña actual no es correcta.');
      }
    }

    const existingEmail = await this.repository.findByEmail(email);
    if (existingEmail && existingEmail.id !== id) throw new ConflictException('Ese correo ya está registrado.');

    const updated = await this.repository.updateProfile(id, fullName, email);
    if (profile.new_password) {
      const passwordHash = await bcrypt.hash(profile.new_password, await bcrypt.genSalt(10));
      await this.repository.updatePassword(id, passwordHash);
    }
    return updated;
  }

  async create(companyId: string, userDto: any) {
    try {
      const initialRole=String(userDto.role||'user');
      if (!companyId || !await this.companyService.roleExists(companyId, initialRole)) {
        throw new BadRequestException('Selecciona un rol configurado para esta empresa.');
      }
      const roles=Array.isArray(userDto.role_keys)?[...new Set([initialRole,...userDto.role_keys.map(String)])]:[initialRole];
      for(const role of roles)if(!await this.companyService.roleExists(companyId,role))throw new BadRequestException(`El rol ${role} no está configurado para esta empresa.`);
      if(!await this.repository.validOrgAssignment(companyId,userDto.department_id,userDto.position_id))throw new BadRequestException('El departamento o cargo no corresponde a esta empresa.');
      if(!await this.repository.validWarehouseAssignment(companyId,userDto.assigned_warehouse_id))throw new BadRequestException('La bodega asignada no pertenece a esta empresa.');
      const policy=await this.repository.getSecurityPolicy(companyId);
      if(String(userDto.password||'').length<Number(policy?.min_password_length||10))throw new BadRequestException(`La contraseña debe tener al menos ${policy?.min_password_length||10} caracteres.`);
      const existingUser = await this.repository.findByUsername(userDto.username);
      if (existingUser) {
        throw new ConflictException('El nombre de usuario ya está en uso');
      }

      // Validar email también para evitar error 500 por restricción UNIQUE
      if (userDto.email && await this.repository.findByEmail(userDto.email)) {
        throw new ConflictException('El correo electrónico ya está registrado');
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(userDto.password, salt);

      const created=await this.repository.create(companyId, {
        ...userDto,
        role:initialRole,
        password_hash: passwordHash,
      });
      if(roles.length>1)await this.repository.syncUserRoles(companyId,created.id,roles,initialRole);
      return created;
    } catch (error) {
      console.error('Error in UsersService.create:', error);
      throw error;
    }
  }

  async update(companyId: string, id: string, userDto: any) {
    const current=await this.repository.findById(id,companyId);
    if(!current)throw new BadRequestException('No se encontró el usuario dentro de esta empresa.');
    if(userDto.password!==undefined&&userDto.password!==''&&String(userDto.password).length<Number((await this.repository.getSecurityPolicy(companyId))?.min_password_length||10))throw new BadRequestException('La contraseña no cumple la política de longitud mínima.');
    const primaryRole=String(userDto.role??current.role??'');
    const requestedRoles=userDto.role_keys??current.role_keys;
    const roles=Array.isArray(requestedRoles)?[...new Set([...(primaryRole?[primaryRole]:[]),...requestedRoles.map(String)])]:(primaryRole?[primaryRole]:undefined);
    if (roles) {
      for(const role of roles)if(!await this.companyService.roleExists(companyId,role))throw new BadRequestException(`El rol ${role} no está configurado para esta empresa.`);
    } else if(primaryRole&&!await this.companyService.roleExists(companyId,primaryRole))throw new BadRequestException('Selecciona un rol configurado para esta empresa.');
    if(userDto.email){const existing=await this.repository.findByEmail(String(userDto.email).trim().toLowerCase());if(existing&&existing.id!==id)throw new ConflictException('Ese correo ya está registrado.');}
    const merged={...current,...userDto,role:primaryRole};
    if(!await this.repository.validOrgAssignment(companyId,merged.department_id,merged.position_id))throw new BadRequestException('El departamento o cargo no corresponde a esta empresa.');
    if(!await this.repository.validWarehouseAssignment(companyId,merged.assigned_warehouse_id))throw new BadRequestException('La bodega asignada no pertenece a esta empresa.');
    if (userDto.password) {
      const salt = await bcrypt.genSalt(12);
      userDto.password_hash = await bcrypt.hash(userDto.password, salt);
      merged.password_hash=userDto.password_hash;
    }
    const updated = await this.repository.update(companyId, id, merged);
    if (!updated) throw new BadRequestException('No se encontró el usuario dentro de esta empresa.');
    await this.repository.syncMembershipAccess(companyId, id, userDto.role, userDto.is_active);
    if(roles)await this.repository.syncUserRoles(companyId,id,roles,primaryRole);
    if(userDto.password)await this.repository.revokeUserSessions(companyId,id);
    return updated;
  }
}
