import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually
const envPath = resolve(__dirname, '../.env')
const envLines = readFileSync(envPath, 'utf8').split('\n')
for (const line of envLines) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
}

const { default: pg } = await import('pg')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const { rows } = await pool.query(`
  SELECT l.name, s.code as state_code, l.center_point, l.metadata->>'flyway' as flyway
  FROM locations l
  JOIN states s ON l.state_id = s.id
  WHERE l.location_type = 'wildlife_refuge'
    AND l.center_point IS NOT NULL
    AND (l.metadata->>'survey_only') IS DISTINCT FROM 'true'
    AND l.name NOT LIKE '% - Statewide MWI'
  ORDER BY s.code, l.name
  LIMIT 30
`)

console.log(`Found ${rows.length} refuges with coordinates:`)
for (const r of rows) {
  console.log(`${r.state_code} | ${r.name} | ${JSON.stringify(r.center_point)} | flyway: ${r.flyway}`)
}

// Also check total without the center_point filter
const { rows: all } = await pool.query(`
  SELECT COUNT(*) as total,
    COUNT(center_point) as with_coords
  FROM locations WHERE location_type = 'wildlife_refuge'
`)
console.log('\nTotal refuges:', all[0].total, '| With coords:', all[0].with_coords)

await pool.end()
