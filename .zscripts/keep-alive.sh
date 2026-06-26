#!/bin/bash
# Persistent dev server — restarts immediately if it crashes
cd /home/z/my-project
export NEXT_TELEMETRY_DISABLED=1

while true; do
  echo "[$(date '+%H:%M:%S')] Starting next dev..."
  node node_modules/.bin/next dev -p 3000 > dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date '+%H:%M:%S')] Server exited with code $EXIT_CODE, restarting in 1s..."
  sleep 1
done
