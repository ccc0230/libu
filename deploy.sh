#!/bin/bash

set -e

APP_NAME="libu"
APP_DIR="/home/$APP_NAME"
REPO_URL="https://github.com/ccc0230/libu.git"
NODE_VERSION="18"
PORT=3000

echo "============================================"
echo "  曹家礼簿系统 - 一键部署脚本"
echo "============================================"

# 1. 安装 Node.js
echo ""
echo "[1/6] 安装 Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"

# 2. 安装 PM2
echo ""
echo "[2/6] 安装 PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
echo "PM2: $(pm2 -v)"

# 3. 安装 Nginx
echo ""
echo "[3/6] 安装 Nginx..."
if ! command -v nginx &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y nginx
fi
echo "Nginx: $(nginx -v 2>&1)"

# 4. 拉取代码
echo ""
echo "[4/6] 拉取项目代码..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 5. 安装依赖并启动
echo ""
echo "[5/6] 安装依赖并启动服务..."
npm install --production

pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 start server.js --name "$APP_NAME"
pm2 save

# 设置开机自启
pm2 startup systemd -u "$USER" --hp "/home/$USER" 2>/dev/null || true

# 6. 配置 Nginx
echo ""
echo "[6/6] 配置 Nginx 反向代理..."
NGINX_CONF="/etc/nginx/sites-available/$APP_NAME"
sudo tee "$NGINX_CONF" > /dev/null <<EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo ""
echo "============================================"
echo "  部署完成！"
echo "============================================"
echo ""
echo "  访问地址: http://$(hostname -I | awk '{print $1}')"
echo "  项目目录: $APP_DIR"
echo "  数据库:   $APP_DIR/data/libu.db"
echo ""
echo "  常用命令:"
echo "    pm2 status          查看服务状态"
echo "    pm2 logs $APP_NAME   查看日志"
echo "    pm2 restart $APP_NAME 重启服务"
echo ""
