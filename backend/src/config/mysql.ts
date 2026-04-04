import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? 'sr603743-001.eu.clouddb.ovh.net',
      port: Number(process.env.MYSQL_PORT ?? 35305),
      database: process.env.MYSQL_DATABASE ?? 'invader',
      user: process.env.MYSQL_USER ?? 'invader',
      password: process.env.MYSQL_PASSWORD ?? '',
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

export default getMysqlPool;
