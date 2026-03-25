import { db } from '../config/database';
import fs from 'fs';
import path from 'path';

export async function runMigrations(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      run_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  const migrationDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await db.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file]
    );
    if (rows.length === 0) {
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`[migrate] Applied: ${file}`);
    }
  }
  console.log('[migrate] All migrations up to date.');
}
