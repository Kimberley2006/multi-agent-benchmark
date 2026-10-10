#!/usr/bin/env bash
# TraceLab 一键启动/重启：bash ./start.sh
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="/tmp/tracelab-server.log"

# 仅清理当前 checkout 的服务进程，避免误杀其他项目。
pkill -f "^node $DIR/server/index.js$" 2>/dev/null && sleep 1
cd "$DIR" || { echo "目录不存在: $DIR"; exit 1; }

echo "构建当前 checkout 的前端资源 …"
npm run build || exit 1

setsid nohup node "$DIR/server/index.js" > "$LOG" 2>&1 < /dev/null &
sleep 2

if curl -s -m 2 http://127.0.0.1:8787/api/status | grep -q '"ok":true'; then
  # 确认新代码生效（现象聚合路由存在）
  if ! curl -s -m 2 http://127.0.0.1:8787/api/phenomena | grep -q 'runsCovered'; then
    echo "⚠ 检测到旧版本进程占用端口，请重跑本脚本"; exit 1
  fi
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  echo "✅ TraceLab 运行中: http://${IP:-127.0.0.1}:8787"
  echo "   日志: tail -f $LOG"
else
  echo "❌ 启动失败，最近日志："
  tail -5 "$LOG"
  exit 1
fi
