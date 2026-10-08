#!/usr/bin/env bash
# 停止 TraceLab：bash /data1/wuhan/trace-lab-export/stop.sh
pkill -f "^node /data1/wuhan/trace-lab-export/server" 2>/dev/null && echo "✅ 已停止" || echo "服务本就未在运行"
