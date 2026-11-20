import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { SecurityService } from '../security/security.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly securityService: SecurityService
  ) {}

  async register(companyId: string, userDto: any) {
    return this.usersService.create(companyId, userDto);
  }

  async login(username: string, pass: string, request?: { ip?: string; userAgent?: string }, otp?:string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      await this.usersService.recordLoginAttempt(username,request?.ip,false);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('La cuenta está desactivada. Contacta al administrador.');
    }

    const membership = await this.usersService.findDefaultMembership(user.id);
    if (!membership?.company_id) {
      await this.usersService.recordLoginAttempt(username,request?.ip,false,membership.company_id);
      throw new UnauthorizedException('El usuario no tiene acceso a una empresa activa.');
    }

    if (await this.usersService.isLoginLocked(username,membership.company_id)) throw new UnauthorizedException('Cuenta bloqueada temporalmente por intentos fallidos.');
    const isMatch = await bcrypt.compare(pass, user.password_hash);
    if (!isMatch) {
      await this.usersService.recordLoginAttempt(username,request?.ip,false,membership.company_id);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const policy=await this.usersService.getSecurityPolicy(membership.company_id);
    const mfa=await this.securityService.mfaStatus(membership.company_id,user.id);
    if(policy?.require_mfa&&!mfa.enabled)throw new UnauthorizedException('Debes activar MFA antes de acceder. Solicita a tu administrador que aplique la política después de completar el enrolamiento.');
    if(mfa.enabled&&!await this.securityService.verifyLoginMfa(membership.company_id,user.id,String(otp||''))){await this.usersService.recordLoginAttempt(username,request?.ip,false,membership.company_id);throw new UnauthorizedException('Código MFA inválido o faltante.');}

    const role = membership.role || user.role;
    await this.usersService.recordLoginAttempt(username,request?.ip,true,membership.company_id);
    await this.usersService.markLogin(user.id);
    const roles = await this.usersService.findCompanyRoles(membership.company_id,user.id);
    const assignedRoles = roles.length ? roles : [role];
    const permissions = await this.usersService.findCompanyPermissions(membership.company_id,user.id);
    const sessionHours = Number(policy?.session_hours || 12);
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now()+sessionHours*60*60*1000);
    await this.usersService.createSession({id:sessionId,companyId:membership.company_id,userId:user.id,ip:request?.ip,userAgent:request?.userAgent,expiresAt});
    const payload = {
      sub: user.id,
      username: user.username,
      role,
      roles: assignedRoles,
      company_id: membership.company_id,
      branch_id: membership.branch_id,
      sid: sessionId,
    };
    return {
      access_token: await this.jwtService.signAsync(payload,{expiresIn:`${sessionHours}h`}),
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        avatar_url: user.avatar_url,
        role,
        roles: assignedRoles,
        company_id: membership.company_id,
        branch_id: membership.branch_id,
        permissions,
      }
    };
  }

  async logout(userId:string,sessionId?:string){if(sessionId)await this.usersService.revokeSession(sessionId,userId);return {success:true};}
}
