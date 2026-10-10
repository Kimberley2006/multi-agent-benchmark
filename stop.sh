#!/usr/bin/env bash
# 停止当前 checkout 的 TraceLab 服务：bash ./stop.sh
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkill -f "^node $DIR/server/index.js$" 2>/dev/null && echo "✅ 已停止" || echo "服务本就未在运行"
