import { Injectable, ConflictException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async findAll() {
    return this.repository.findAll();
  }

  async findByUsername(username: string) {
    return this.repository.findByUsername(username);
  }

  async findById(id: string) {
    return this.repository.findById(id);
  }

  async create(userDto: any) {
    try {
      const existingUser = await this.repository.findByUsername(userDto.username);
      if (existingUser) {
        throw new ConflictException('El nombre de usuario ya está en uso');
      }

      // Validar email también para evitar error 500 por restricción UNIQUE
      const allUsers = await this.repository.findAll();
      if (allUsers.find(u => u.email === userDto.email)) {
        throw new ConflictException('El correo electrónico ya está registrado');
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(userDto.password, salt);

      return await this.repository.create({
        ...userDto,
        password_hash: passwordHash,
      });
    } catch (error) {
      console.error('Error in UsersService.create:', error);
      throw error;
    }
  }

  async update(id: string, userDto: any) {
    if (userDto.password) {
      const salt = await bcrypt.genSalt(10);
      userDto.password_hash = await bcrypt.hash(userDto.password, salt);
    }
    return this.repository.update(id, userDto);
  }
}
