import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded, static as serveStatic } from 'express';
import { join } from 'path';

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe configurarse con al menos 32 caracteres.');
  }
  if (!process.env.DATABASE_PASSWORD) {
    throw new Error('DATABASE_PASSWORD debe configurarse antes de iniciar el backend.');
  }

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use('/uploads', serveStatic(join(process.cwd(), 'uploads')));
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
