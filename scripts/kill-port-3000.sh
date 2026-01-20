#!/bin/bash
# Kills any process listening on port 3000 (typically Next.js dev server)

set -e

PIDS=$(lsof -ti :3000 2>/dev/null || true)

if [ -z "$PIDS" ]; then
    echo "No process found on port 3000"
    exit 0
fi

echo "Killing processes on port 3000: $PIDS"
echo "$PIDS" | xargs kill -9

echo "Done"
