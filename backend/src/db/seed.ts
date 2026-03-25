import bcrypt from 'bcryptjs';
import { db } from '../config/database';

/**
 * Creates default demo accounts on every startup.
 * Safe to run repeatedly — uses ON CONFLICT DO NOTHING.
 *
 * SuperAdmin → superadmin@surveyai.com / SuperAdmin123!
 * Admin      → admin@empresa.com       / Admin123!
 */
export async function seedDefaultUsers(): Promise<void> {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');

  const superHash = await bcrypt.hash('SuperAdmin123!', rounds);
  const adminHash = await bcrypt.hash('Admin123!', rounds);

  await db.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'superadmin')
     ON CONFLICT (email) DO NOTHING`,
    ['superadmin@surveyai.com', superHash]
  );

  await db.query(
    `INSERT INTO users (email, password_hash, role, company_name, permissions)
     VALUES ($1, $2, 'admin', $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    ['admin@empresa.com', adminHash, 'Empresa Demo', JSON.stringify({ can_export: true })]
  );

  console.log('[seed] Default accounts ready.');
  console.log('[seed]   SuperAdmin → superadmin@surveyai.com / SuperAdmin123!');
  console.log('[seed]   Admin      → admin@empresa.com       / Admin123!');
}
