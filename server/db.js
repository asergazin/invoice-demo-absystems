import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export async function ensureDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Create PostgreSQL database and set DATABASE_URL in .env');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS invoices_deleted_at_idx ON invoices (deleted_at);
    CREATE INDEX IF NOT EXISTS invoices_data_gin_idx ON invoices USING GIN (data);
  `);
}

const mapInvoice = (row) => {
  const data = row.data || {};
  return {
    ...data,
    dbId: row.id,
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : data.deletedAt,
  };
};

export async function listInvoices() {
  const { rows } = await pool.query(`
    SELECT id, data, deleted_at, created_at
    FROM invoices
    ORDER BY created_at DESC
  `);

  return {
    data: rows.filter((row) => !row.deleted_at).map(mapInvoice),
    trash: rows.filter((row) => row.deleted_at).map(mapInvoice),
  };
}

export async function importInvoices(rows) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const incoming of rows) {
      const id = incoming.dbId || crypto.randomUUID();
      const data = { ...incoming, dbId: id };
      delete data.deletedAt;

      await client.query(
        `INSERT INTO invoices (id, data, deleted_at, updated_at)
         VALUES ($1, $2::jsonb, NULL, NOW())
         ON CONFLICT (id)
         DO UPDATE SET data = EXCLUDED.data, deleted_at = NULL, updated_at = NOW()`,
        [id, JSON.stringify(data)]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return listInvoices();
}

export async function updateInvoice(id, field, value) {
  const { rows } = await pool.query('SELECT data FROM invoices WHERE id = $1', [id]);
  if (rows.length === 0) return null;

  const data = {
    ...rows[0].data,
    [field]: value,
    'Дата изменения': new Date().toISOString(),
  };

  const result = await pool.query(
    `UPDATE invoices
     SET data = $2::jsonb, updated_at = NOW()
     WHERE id = $1
     RETURNING id, data, deleted_at`,
    [id, JSON.stringify(data)]
  );

  return mapInvoice(result.rows[0]);
}

export async function softDeleteInvoices(ids) {
  const deletedAt = new Date().toISOString();
  await pool.query(
    `UPDATE invoices
     SET data = data || jsonb_build_object('deletedAt', $2::text),
         deleted_at = $2::timestamptz,
         updated_at = NOW()
     WHERE id = ANY($1::text[])`,
    [ids, deletedAt]
  );
  return listInvoices();
}

export async function restoreInvoices(ids) {
  await pool.query(
    `UPDATE invoices
     SET data = data - 'deletedAt',
         deleted_at = NULL,
         updated_at = NOW()
     WHERE id = ANY($1::text[])`,
    [ids]
  );
  return listInvoices();
}

export async function permanentlyDeleteInvoices(ids) {
  await pool.query('DELETE FROM invoices WHERE id = ANY($1::text[])', [ids]);
  return listInvoices();
}
