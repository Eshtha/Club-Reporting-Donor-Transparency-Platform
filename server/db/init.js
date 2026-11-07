import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const usingSupabaseUrl = Boolean(process.env.POSTGRES_URL && !process.env.DATABASE_URL);
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const connectionString = usingSupabaseUrl ? databaseUrl.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '') : databaseUrl;
const pool = new Pool({ connectionString, ssl: usingSupabaseUrl ? { rejectUnauthorized: false } : undefined });
try {
 await pool.query(fs.readFileSync(path.join(here,'schema.sql'),'utf8'));
 await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
   version TEXT PRIMARY KEY,
   applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 const migrationsDir = path.join(here, 'migrations');
 const migrations = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();
 for (const migration of migrations) {
   const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1', [migration]);
   if (applied.rowCount) continue;
   const client = await pool.connect();
   try {
     await client.query('BEGIN');
     await client.query(fs.readFileSync(path.join(migrationsDir, migration), 'utf8'));
     await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [migration]);
     await client.query('COMMIT');
     console.log(`Applied migration ${migration}.`);
   } catch (error) {
     await client.query('ROLLBACK');
     throw error;
   } finally {
     client.release();
   }
 }
 console.log('Database schema ready.');
}
catch (e) { console.error(e.message); process.exitCode=1; }
finally { await pool.end(); }
