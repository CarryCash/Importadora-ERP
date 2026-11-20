import { Controller, Post, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { Permissions } from './permissions.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(RolesGuard)
  @Roles('admin', 'erp_admin')
  @Permissions('users.manage')
  @Post('register')
  register(@Body() signUpDto: any, @Req() request: Request & { user?: { company_id: string } }) {
    return this.authService.register(request.user?.company_id || '', signUpDto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() signInDto: any, @Req() request: Request) {
    return this.authService.login(signInDto.username, signInDto.password, {ip:request.ip,userAgent:request.headers['user-agent']},signInDto.otp);
  }

  @Post('logout')
  logout(@Req() request: Request & {user?:{sub:string;sid?:string}}) {
    return this.authService.logout(request.user?.sub||'',request.user?.sid);
  }
}

