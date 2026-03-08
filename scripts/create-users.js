/**
 * Script one-shot pour créer les utilisateurs externes
 * Exécuter avec: node scripts/create-users.js
 */

const API_URL = 'http://localhost:3001';

const users = [
  { email: 'nassimmouelhi@yahoo.co.uk', password: 'Xk8mPq2vLn' },
  { email: 'jonathan@kezako.games', password: 'Wr5tHj9cBf' },
  { email: 'adrian.irastorza@gmail.com', password: 'Ym7nQs4dKp' },
  { email: 'bijoux.event34@gmail.com', password: 'Lc3wRt8vNx' },
  { email: 'nat.soullier@gmail.com', password: 'Gf6jDk1mZq' },
  { email: 'jmdavidominguez@gmail.com', password: 'Hn9pWx5sTb' },
];

async function main() {
  // Login as admin first
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'romain.darbas7@gmail.com', password: process.argv[2] }),
  });
  
  if (!loginRes.ok) {
    console.error('Login failed:', await loginRes.text());
    process.exit(1);
  }
  
  const { session } = await loginRes.json();
  const token = session.access_token;

  for (const user of users) {
    const res = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ email: user.email, password: user.password, role: 'externe' }),
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`OK: ${user.email}`);
    } else {
      console.error(`ERREUR ${user.email}: ${data.message}`);
    }
  }
}

main();
