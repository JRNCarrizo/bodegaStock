/** Traduce SQL pensado para SQLite a Postgres (placeholders y dialecto común). */

const UTC_NOW =
  "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"

export function sqliteSchemaToPostgres(schemaSql: string): string {
  return schemaSql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/DEFAULT \(datetime\('now'\)\)/gi, `DEFAULT (${UTC_NOW})`)
}

export function translateSqliteSql(sql: string): string {
  let s = sql.trim()

  const insertOrIgnore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(s)
  if (insertOrIgnore) {
    s = s.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO')
  }

  s = s.replace(/datetime\('now'\)/gi, UTC_NOW)
  s = s.replace(/\s+COLLATE\s+NOCASE/gi, '')
  s = s.replace(/\bexcluded\./gi, 'EXCLUDED.')

  if (insertOrIgnore && !/\bON\s+CONFLICT\b/i.test(s)) {
    s = `${s.replace(/;?\s*$/, '')} ON CONFLICT DO NOTHING`
  }

  const isInsert = /^\s*INSERT\s+/i.test(s)
  if (isInsert && !/\bRETURNING\b/i.test(s)) {
    s = `${s.replace(/;?\s*$/, '')} RETURNING *`
  }

  let n = 0
  s = s.replace(/\?/g, () => `$${++n}`)
  return s
}
