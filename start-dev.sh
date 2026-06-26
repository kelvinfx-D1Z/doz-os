#!/bin/bash
# Watchdog: keeps the Next.js dev server running
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting dev server..."
  node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &
  SERVER_PID=$!
  echo "[$(date)] Server PID: $SERVER_PID"
  
  # Wait for it to be ready
  for i in $(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
      echo "[$(date)] Server is ready"
      break
    fi
    sleep 1
  done
  
  # Wait for the process to exit
  wait $SERVER_PID 2>/dev/null
  echo "[$(date)] Server exited (code $?), restarting in 2s..."
  sleep 2
done
