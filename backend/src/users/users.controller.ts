import { Controller, Get, Post, Body, Put, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body() userDto: any) {
    return this.usersService.create(userDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() userDto: any) {
    return this.usersService.update(id, userDto);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
