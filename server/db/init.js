import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try { await pool.query(fs.readFileSync(path.join(here,'schema.sql'),'utf8')); console.log('Database schema ready.'); }
catch (e) { console.error(e.message); process.exitCode=1; }
finally { await pool.end(); }
