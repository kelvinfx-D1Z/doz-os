#!/bin/bash
cd /home/z/my-project
export NEXT_TELEMETRY_DISABLED=1
pkill -9 -f "next dev" 2>/dev/null
sleep 1
nohup node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &
echo $! > .zscripts/dev.pid
