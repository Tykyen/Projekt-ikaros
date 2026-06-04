# Projekt Ikaros Backend Deployment

Manual GitHub Actions deployment copies this repository to `/opt/projekt-ikaros-be` and runs `docker-compose.prod.yml` there.

The production compose stack exposes only the Nest backend to the host. MongoDB, Redis, and MeiliSearch stay internal to the Docker network so they do not conflict with the old Matrix deployment.

## GitHub Environment

Create a `production` environment with these variables/secrets:

Secrets:
- `SSH_PRIVATE_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CLOUDINARY_URL`
- `TURNSTILE_SECRET`
- `VAPID_PRIVATE_KEY`
- `MEILI_MASTER_KEY`

Variables:
- `SERVER_HOST`
- `SERVER_PORT`
- `SSH_USER`
- `BACKEND_PORT` defaults to `3001` if empty
- `FRONTEND_URL`, for example `https://ikaros.example.com`
- `BACKEND_BASE_URL`, for example `https://ikaros.example.com`
- `JWT_EXPIRES_IN` defaults to `7d` if empty
- `JWT_REFRESH_TTL_DAYS` defaults to `30` if empty
- `CLOUDINARY_CLOUD_NAME`
- `VAPID_SUBJECT`, for example `mailto:admin@example.com`
- `VAPID_PUBLIC_KEY`
- `DELETION_HOLD_DAYS` defaults to `14` if empty
- `EMBEDDING_GRANITE107_ENABLED` defaults to `true` if empty
- `EMBEDDING_GRANITE278_ENABLED` defaults to `true` if empty

## Reverse Proxy

Route backend traffic to:

```text
/api/ -> http://SERVER:3001
/socket.io/ -> http://SERVER:3001
/static/ -> http://SERVER:3001
/docs/ -> http://SERVER:3001
```

The frontend should usually be built with an empty `VITE_API_URL`, so REST and Socket.IO use the same public origin.
