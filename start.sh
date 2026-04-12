#!/bin/sh
set -e
echo "=== Running database migrations ==="
npx drizzle-kit push --force || echo "drizzle-kit push failed, continuing..."
echo "=== Starting server ==="
exec node dist/index.cjs
