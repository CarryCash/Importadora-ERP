import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number(process.env.DATABASE_PORT || 5432),
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME || 'importadora',
      max: Number(process.env.DATABASE_POOL_SIZE || 10),
      connectionTimeoutMillis: 5000,
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
      throw error;
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
