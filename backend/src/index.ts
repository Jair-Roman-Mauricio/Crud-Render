import 'dotenv/config';
import app from './app';
import { runMigrations } from './db/migrate';
import { seedDefaultUsers } from './db/seed';

const PORT = process.env.PORT || 3001;

(async () => {
  await runMigrations();
  await seedDefaultUsers();
  app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });
})();
