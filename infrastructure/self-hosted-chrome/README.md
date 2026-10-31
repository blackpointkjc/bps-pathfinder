# Pathfinder — self-hosted Chrome

This is a ready-to-run local LinuxServer Chrome Docker setup. It is not an activated service inside Base44: Base44 hosts the Pathfinder app, but does not host persistent Docker containers.

## Start a local smoke test

1. Install Docker Engine and Compose on a computer/server that will remain online.
2. Copy .env.example to .env; replace the password with a strong secret.
3. From this directory run: docker compose up -d
4. On that computer, visit https://localhost:3001 and test Chrome.
5. Check with: docker compose ps, docker compose logs --tail=60

The self-signed certificate may show a warning on local testing.
This single user environment binds port 3001 to localhost only, NOT the public Internet.

## Requirements before connecting to Pathfinder employees

- Secure external TLS access via a reverse proxy or tunnel protected by identity authentication.
- Dedicated isolated browser sessions per employee; no shared logins, files, or browser histories.
- Server-side policy-enforcing navigation for non-admin employees, including streaming, adult, and social blocking at every navigation step.
- Authorization bound to the HR user profile and acceptable-use acknowledgment.
- A broker that provisions/authorizes the individual viewer, rather than an exposed shared desktop URL.

WARNING: LinuxServer's Chrome image can provide powerful system/terminal access and starts without public-grade authentication. Never expose the container directly, even behind an unprotected tunnel. The local BASIC auth is supplemental only.

Software is free; a continuously running host is still required and may cost money.
Official docs: https://docs.linuxserver.io/images/docker-chrome/
