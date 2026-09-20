#!/usr/bin/env bash
# 一键备份：把「代码之外」的东西（数据库 + 站点配置 + .env）打包，供换机恢复。
#
# 用法（Git Bash，在本机项目根目录执行）：
#   bash erp/backup.sh
#
# 输出：backups/erpnext-backup-<时间戳>.tar.gz
# ⚠️ 请把生成的 .tar.gz 拷到本机之外（移动硬盘 / 网盘 / 第二台电脑）保存，否则换机无法恢复。
set -euo pipefail

# 关闭 MSYS 路径自动转换，避免把容器内 /data 等路径转成 Windows 路径（Git Bash + Docker 常见坑）
export MSYS_NO_PATHCONV=1

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/frappe_docker"
DB_PASSWORD="${DB_PASSWORD:-erpnext-dev-123}"
DB_NAME="${DB_NAME:-_ebde57cb5cf2199a}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$REPO_ROOT/backups/$STAMP"
OUT_TAR="$REPO_ROOT/backups/erpnext-backup-$STAMP.tar.gz"

mkdir -p "$OUT_DIR"

echo "[1/5] 检查 Docker Desktop 是否运行..."
docker info >/dev/null 2>&1 || { echo "  ✗ Docker Desktop 未运行，请先启动再执行"; exit 1; }

echo "[2/5] 识别 compose 命名卷..."
SITES_VOL="$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)sites$' | head -1 || true)"
DB_VOL="$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)db-data$' | head -1 || true)"
echo "  sites=$SITES_VOL  db=$DB_VOL"

echo "[3/5] 导出数据库 SQL（可读副本）..."
if docker exec frappe_docker-db-1 mariadb-dump -uroot -p"$DB_PASSWORD" "$DB_NAME" > "$OUT_DIR/snapshot.sql" 2>/dev/null; then
  echo "  已导出 snapshot.sql"
else
  echo "  (警告) SQL 导出失败，仍会继续用卷备份兜底"
fi

echo "[4/5] 复制 .env 与打包 Docker 卷（含全部数据 + 站点加密钥）..."
[ -f "$COMPOSE_DIR/.env" ] && cp "$COMPOSE_DIR/.env" "$OUT_DIR/env.backup" || echo "  (警告) 未找到 frappe_docker/.env"

# 卷内容经 stdout 重定向落盘（避免 Windows bind-mount 路径问题）
if [ -n "$SITES_VOL" ]; then
  docker run --rm -v "$SITES_VOL:/data" alpine tar czf - -C /data . > "$OUT_DIR/sites.tar.gz" \
    && echo "  已备份卷 sites" || echo "  ✗ sites 卷备份失败"
fi
if [ -n "$DB_VOL" ]; then
  docker run --rm -v "$DB_VOL:/data" alpine tar czf - -C /data . > "$OUT_DIR/db-data.tar.gz" \
    && echo "  已备份卷 db-data" || echo "  ✗ db-data 卷备份失败"
fi

{
  echo "备份时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "ERPNEXT_VERSION: $(grep '^ERPNEXT_VERSION=' "$COMPOSE_DIR/.env" 2>/dev/null || echo 'v15.121.2')"
  echo "DB_NAME: $DB_NAME"
  echo "sites_volume: $SITES_VOL"
  echo "db_volume: $DB_VOL"
} > "$OUT_DIR/manifest.txt"

echo "[5/5] 打包成单个文件..."
tar -C "$OUT_DIR" -czf "$OUT_TAR" .
rm -rf "$OUT_DIR"

echo ""
echo "完成: $OUT_TAR"
echo "⚠️ 请立即把它拷到本机之外保存（移动硬盘 / 网盘 / 第二台电脑）。"
