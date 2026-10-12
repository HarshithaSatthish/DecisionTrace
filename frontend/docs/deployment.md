# Deployment

The starter deploys to Vercel out of the box, or anywhere Docker runs. `next.config.ts` sets `output: 'standalone'`, so production builds are optimized for self-hosting.

## Vercel (Recommended for Frontend)

1. Connect the repository to Vercel
2. Add environment variables in the dashboard
3. Deploy

For other platforms, see the [Next.js deployment docs](https://nextjs.org/docs/app/getting-started/deploying).

## Production Full-Stack Environment Architecture

### 1. Frontend Environment Variables (Vercel)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk live publishable key (`pk_live_...`)
- `CLERK_SECRET_KEY`: Clerk secret key (`sk_live_...`)
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`: `"/auth/sign-in"`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`: `"/auth/sign-up"`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`: `"/dashboard/overview"`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`: `"/dashboard/overview"`
- `DECISIONTRACE_BACKEND_URL`: URL of backend FastAPI service with `/api/v1` path (e.g. `https://decisiontrace-api.up.railway.app/api/v1`)
- `NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW`: `"false"` (Strictly enforce live backend data in production)

### 2. Backend Environment Variables (Railway / Cloud Container)
- `APP_ENV`: `"production"` (Required: enforces strict security checks and disables dev mode)
- `DATABASE_URL`: Supported PostgreSQL `psycopg` connection string (e.g. `postgresql+psycopg://user:password@host:port/dbname?sslmode=require`)
- `REDIS_URL`: Redis connection URL (e.g. `redis://default:password@host:6379/0`)
- `RQ_QUEUE_NAME`: `"decisiontrace_processing"` (Critical: API and Worker services MUST share the identical queue name)
- `QDRANT_URL`: Qdrant cluster endpoint (e.g. `https://your-cluster.cloud.qdrant.io:6333`)
- `QDRANT_API_KEY`: Qdrant API key
- `QDRANT_COLLECTION`: `"conversation_chunks_v1"` (Actual production collection name)
- `EMBEDDING_MODEL`: `"BAAI/bge-small-en-v1.5"`
- `EMBEDDING_DIMENSION`: `384` (Do not use 1536; the embedding vector size is strictly 384)
- `CLERK_ISSUER`: Clerk instance issuer URL (e.g. `https://your-domain.clerk.accounts.dev`)
- `CLERK_JWKS_URL`: Clerk public JWKS endpoint (e.g. `https://your-domain.clerk.accounts.dev/.well-known/jwks.json`)
- `CLERK_AUTHORIZED_PARTIES`: Comma-separated allowed origins (e.g. `https://decisiontrace.vercel.app`)
- `AUTH_DEV_MODE`: `"False"` (Must be False in production; startup validator crashes if enabled)
- `LYZR_API_KEY`: Lyzr Studio API Key
- `LYZR_BASE_URL`: `"https://agent-prod.studio.lyzr.ai/v3"` (Studio v3 base URL)
- `LYZR_MANAGER_AGENT_ID`: Production Manager Agent ID

## Docker

Two production-ready Dockerfiles are included: `Dockerfile` (Node.js) and `Dockerfile.bun` (Bun). Pass `NEXT_PUBLIC_*` variables as `--build-arg` at build time and runtime secrets via `-e` at run time.

Build the image:

```bash
# Node.js
docker build \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx \
  -t shadcn-dashboard .

# OR Bun
docker build -f Dockerfile.bun \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx \
  -t shadcn-dashboard .
```

Run the container:

```bash
docker run -d -p 3000:3000 \
  -e NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx \
  -e CLERK_SECRET_KEY=sk_live_xxxxx \
  -e DECISIONTRACE_BACKEND_URL=https://decisiontrace-api.up.railway.app/api/v1 \
  --restart unless-stopped \
  --name shadcn-dashboard \
  shadcn-dashboard
```
