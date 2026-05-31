// Tiny dual-protocol dispatcher used in `civicctl --https` mode.
//
// Listens on PUBLIC_PORT and peeks at the first byte of each TCP connection:
//   • TLS handshake (0x16) → byte-transparent proxy to the internal HTTPS
//     Vite server on 127.0.0.1:UPSTREAM_PORT.
//   • Anything else (plain-HTTP) → reply 301 to the same URL on https://.
//
// Without this, http://host:5173/ would hit Vite's TLS listener, fail the
// handshake, and surface in the browser as ERR_EMPTY_RESPONSE.

import net from "node:net"
import http from "node:http"

const PUBLIC_PORT = Number(process.env.PUBLIC_PORT || 5173)
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT || 5273)
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "127.0.0.1"
const BIND_HOST = process.env.BIND_HOST || "0.0.0.0"
const REDIRECT_INTERNAL_PORT = UPSTREAM_PORT + 1

const redirectServer = http.createServer((req, res) => {
  const hostHeader = req.headers.host || `localhost:${PUBLIC_PORT}`
  const hostname = hostHeader.split(":")[0]
  const location = `https://${hostname}:${PUBLIC_PORT}${req.url || "/"}`
  res.writeHead(301, { Location: location, "Cache-Control": "no-store" })
  res.end(`Redirecting to ${location}\n`)
})
redirectServer.listen(REDIRECT_INTERNAL_PORT, "127.0.0.1")

const dispatcher = net.createServer((client) => {
  client.once("data", (chunk) => {
    client.pause()
    const isTLS = chunk.length > 0 && chunk[0] === 0x16
    const targetPort = isTLS ? UPSTREAM_PORT : REDIRECT_INTERNAL_PORT
    const targetHost = isTLS ? UPSTREAM_HOST : "127.0.0.1"
    const upstream = net.connect(targetPort, targetHost, () => {
      upstream.write(chunk)
      client.pipe(upstream)
      upstream.pipe(client)
      client.resume()
    })
    upstream.on("error", () => client.destroy())
    client.on("error", () => upstream.destroy())
  })
  client.on("error", () => {})
})

dispatcher.listen(PUBLIC_PORT, BIND_HOST, () => {
  console.log(
    `[dispatcher] ${BIND_HOST}:${PUBLIC_PORT}  TLS→127.0.0.1:${UPSTREAM_PORT}  HTTP→301`,
  )
})

const shutdown = () => {
  dispatcher.close()
  redirectServer.close()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
