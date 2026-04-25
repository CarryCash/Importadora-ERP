import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      // Consider using @nestjs/config later for env variables
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'password', // Default, the user will adjust this
      database: 'importadora', // Assuming the DB name is importadora
    });

    this.pool.on('error', (err) => {
      this.logger.error('Error inesperado del cliente de la base de datos', err);
    });
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      client.release();
      this.logger.log('Successfully connected to PostgreSQL Database.');
    } catch (error) {
      this.logger.error('Failed to connect to Database:', error);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  // Wrapper for executing raw SQL queries
  async query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }

  getPool() {
    return this.pool;
  }
}
