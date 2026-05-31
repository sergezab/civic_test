import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

type Env = Record<string, string | undefined>

export const DEFAULT_BACKEND_PORT = '8090'
export const BACKEND_PORT_ENV = 'CIVIC_BACKEND_PORT'
export const API_PROXY_ENV = 'API_PROXY'

const DEFAULT_ENV_FILE = new URL('../server/.env', import.meta.url)
const ASSIGNMENT_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/

function cleanEnvValue(raw: string): string {
  const value = raw.trim()
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  if (quoted) return value.slice(1, -1).trim()

  const commentAt = value.search(/\s+#/)
  return (commentAt >= 0 ? value.slice(0, commentAt) : value).trim()
}

function readEnvValue(envFile: string | URL, key: string): string | undefined {
  const envPath = envFile instanceof URL ? fileURLToPath(envFile) : envFile
  if (!existsSync(envPath)) return undefined

  let value: string | undefined
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(ASSIGNMENT_RE)
    if (match?.[1] === key) value = cleanEnvValue(match[2] ?? '')
  }
  return value
}

function isPort(value: string | undefined): value is string {
  if (!value || !/^\d+$/.test(value)) return false
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65535
}

export function resolveBackendPort(
  env: Env = process.env,
  envFile: string | URL = DEFAULT_ENV_FILE,
): string {
  const envPort = env[BACKEND_PORT_ENV]?.trim()
  if (isPort(envPort)) return envPort

  const filePort = readEnvValue(envFile, BACKEND_PORT_ENV)
  if (isPort(filePort)) return filePort

  return DEFAULT_BACKEND_PORT
}

export function resolveApiProxy(
  env: Env = process.env,
  envFile: string | URL = DEFAULT_ENV_FILE,
): string {
  const explicitProxy = env[API_PROXY_ENV]?.trim()
  if (explicitProxy) return explicitProxy

  return `http://localhost:${resolveBackendPort(env, envFile)}`
}
