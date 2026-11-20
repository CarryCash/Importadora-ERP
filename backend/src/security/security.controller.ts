import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { Public } from '../auth/public.decorator';
import { SecurityService } from './security.service';

type AuthRequest=Request&{user?:{sub:string;company_id:string}};
@Controller('api/security')
export class SecurityController {
  constructor(private readonly service:SecurityService){}
  @Public() @Post('accept-invitation') acceptInvitation(@Body() b:any){return this.service.acceptInvitation(b);}
  @Get('mfa') @Permissions('users.profile') mfaStatus(@Req() r:AuthRequest){return this.service.mfaStatus(r.user!.company_id,r.user!.sub);}
  @Post('mfa/setup') @Permissions('users.profile') setupMfa(@Req() r:AuthRequest){return this.service.setupMfa(r.user!.company_id,r.user!.sub);}
  @Post('mfa/verify') @Permissions('users.profile') verifyMfa(@Req() r:AuthRequest,@Body('code') code:string){return this.service.confirmMfa(r.user!.company_id,r.user!.sub,code);}
  @Delete('mfa') @Permissions('users.profile') disableMfa(@Req() r:AuthRequest){return this.service.disableMfa(r.user!.company_id,r.user!.sub);}
  @Get('departments') @Permissions('users.departments.manage') departments(@Req() r:AuthRequest){return this.service.departments(r.user!.company_id);}
  @Post('departments') @Permissions('users.departments.manage') createDepartment(@Req() r:AuthRequest,@Body() b:any){return this.service.createDepartment(r.user!.company_id,b);}
  @Post('departments/:id/positions') @Permissions('users.departments.manage') createPosition(@Req() r:AuthRequest,@Param('id') id:string,@Body() b:any){return this.service.createPosition(r.user!.company_id,id,b);}
  @Get('branches') @Permissions('users.manage') branches(@Req() r:AuthRequest){return this.service.branches(r.user!.company_id);}
  @Patch('users/:id/branches') @Permissions('users.manage') assignBranches(@Req() r:AuthRequest,@Param('id') id:string,@Body('branch_ids') ids:unknown){return this.service.assignBranches(r.user!.company_id,id,ids);}
  @Get('audit') @Permissions('users.audit') audit(@Req() r:AuthRequest,@Query() q:any){return this.service.audit(r.user!.company_id,q);}
  @Get('sessions') @Permissions('users.security.manage') sessions(@Req() r:AuthRequest){return this.service.sessions(r.user!.company_id);}
  @Get('my-sessions') @Permissions('users.profile') mySessions(@Req() r:AuthRequest){return this.service.mySessions(r.user!.company_id,r.user!.sub);}
  @Delete('my-sessions/:id') @Permissions('users.profile') revokeMySession(@Req() r:AuthRequest,@Param('id') id:string){return this.service.revokeMySession(r.user!.company_id,r.user!.sub,id);}
  @Get('login-attempts') @Permissions('users.security.manage') loginAttempts(@Req() r:AuthRequest,@Query('limit') limit:string){return this.service.loginAttempts(r.user!.company_id,limit);}
  @Delete('sessions/:id') @Permissions('users.security.manage') revokeSession(@Req() r:AuthRequest,@Param('id') id:string){return this.service.revokeSession(r.user!.company_id,id);}
  @Get('policy') @Permissions('users.security.manage') policy(@Req() r:AuthRequest){return this.service.policy(r.user!.company_id);}
  @Patch('policy') @Permissions('users.security.manage') updatePolicy(@Req() r:AuthRequest,@Body() b:any){return this.service.updatePolicy(r.user!.company_id,r.user!.sub,b);}
  @Get('invitations') @Permissions('users.invite') invitations(@Req() r:AuthRequest){return this.service.invitations(r.user!.company_id);}
  @Post('invitations') @Permissions('users.invite') createInvitation(@Req() r:AuthRequest,@Body() b:any){return this.service.createInvitation(r.user!.company_id,r.user!.sub,b);}
  @Delete('invitations/:id') @Permissions('users.invite') revokeInvitation(@Req() r:AuthRequest,@Param('id') id:string){return this.service.revokeInvitation(r.user!.company_id,id);}
  @Get('approval-workflows') @Permissions('approvals.read') workflows(@Req() r:AuthRequest){return this.service.workflows(r.user!.company_id);}
  @Post('approval-workflows') @Permissions('approvals.manage') createWorkflow(@Req() r:AuthRequest,@Body() b:any){return this.service.createWorkflow(r.user!.company_id,b);}
  @Get('approval-requests') @Permissions('approvals.read') requests(@Req() r:AuthRequest){return this.service.requests(r.user!.company_id);}
  @Post('approval-requests') @Permissions('approvals.read') createRequest(@Req() r:AuthRequest,@Body() b:any){return this.service.createRequest(r.user!.company_id,r.user!.sub,b);}
  @Patch('approval-requests/:id') @Permissions('approvals.review') decideRequest(@Req() r:AuthRequest,@Param('id') id:string,@Body() b:any){return this.service.decideRequest(r.user!.company_id,r.user!.sub,id,b);}
}
