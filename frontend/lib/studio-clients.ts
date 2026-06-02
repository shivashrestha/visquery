/**
 * Studio client credential registry.
 *
 * Sources:
 *   - `STUDIO_CLIENT_N_PASSWORD_HASH` (bcrypt)  → preferred for prod
 *   - `STUDIO_CLIENT_N_PASSWORD`      (plain)   → dev only, hashed at startup
 *
 * On verify, both branches use bcrypt.compare → constant-time.
 * On startup, plaintext passwords are hashed once and cached.
 */
import bcrypt from 'bcryptjs';

export interface StudioClient {
  email: string;
  name: string;
  role: string;
  plan: string;
  passwordHash: string;
}

function loadClients(): StudioClient[] {
  const out: StudioClient[] = [];
  for (let i = 1; i <= 10; i++) {
    const email = (process.env[`STUDIO_CLIENT_${i}_EMAIL`] ?? '').trim().toLowerCase();
    if (!email) continue;
    const name = process.env[`STUDIO_CLIENT_${i}_NAME`] ?? `Client ${i}`;
    const role = process.env[`STUDIO_CLIENT_${i}_ROLE`] ?? (i === 1 ? 'architect' : 'designer');
    const plan = process.env[`STUDIO_CLIENT_${i}_PLAN`] ?? 'studio';

    const hash = process.env[`STUDIO_CLIENT_${i}_PASSWORD_HASH`];
    const plain = process.env[`STUDIO_CLIENT_${i}_PASSWORD`];

    let passwordHash: string | null = null;
    if (hash && hash.startsWith('$2')) {
      passwordHash = hash;
    } else if (plain) {
      // Hash plaintext at startup — cost 8 keeps boot fast for dev.
      passwordHash = bcrypt.hashSync(plain, 8);
    }
    if (!passwordHash) continue;
    out.push({ email, name, role, plan, passwordHash });
  }
  return out;
}

let _clientsCache: StudioClient[] | null = null;
export function getClients(): StudioClient[] {
  if (_clientsCache === null) _clientsCache = loadClients();
  return _clientsCache;
}

export async function findAndVerify(
  emailRaw: string,
  password: string,
): Promise<StudioClient | null> {
  const email = (emailRaw ?? '').trim().toLowerCase();
  if (!email || !password) return null;
  const clients = getClients();
  const match = clients.find((c) => c.email === email);
  if (!match) {
    // Spend equivalent cycles to mitigate timing leak on missing-email path.
    await bcrypt.compare(password, '$2a$08$abcdefghijklmnopqrstuuOXa.G2/9LXKqYfk1AaWlIvJZD/dxXne');
    return null;
  }
  const ok = await bcrypt.compare(password, match.passwordHash);
  return ok ? match : null;
}
