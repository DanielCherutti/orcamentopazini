#!/bin/bash
# Description: Starts the Next.js frontend in development mode
# Usage: ./dev.sh

# Libera porta 3000 caso esteja ocupada
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

cd front
export NODE_ENV=development
# Polling necessário para file watching em volumes montados (ex: /Volumes/Data)
export CHOKIDAR_USEPOLLING=true
export CHOKIDAR_INTERVAL=1000

echo "Starting Next.js dev server..."
npm run dev
