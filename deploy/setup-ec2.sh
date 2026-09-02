#!/usr/bin/env bash
# EC2(Amazon Linux 2023, t3.medium) 통짜 배포 최초 1회 세팅 — sudo bash deploy/setup-ec2.sh
# 전제: 코드가 /home/ec2-user/trading-gym 에 git clone 돼 있음
set -euo pipefail
ROOT=/home/ec2-user/trading-gym

# 1) 스왑 4GB — EC2에서 빌드까지 하는 경우의 여유분(런타임만이면 2GB로 충분)
if ! swapon --show | grep -q swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2) 런타임: Java 21 + Node 20 + Python 3.11 + nginx + git
dnf install -y java-21-amazon-corretto-headless nodejs20 nodejs20-npm python3.11 python3.11-pip nginx git
ln -sf /usr/bin/node-20 /usr/bin/node 2>/dev/null || true
ln -sf /usr/bin/npm-20 /usr/bin/npm 2>/dev/null || true

# 3) nginx — 한 도메인에서 / 는 프론트(:8088), /api 는 백엔드(:8079)
cat > /etc/nginx/conf.d/tg.conf <<'NGINX'
server {
    listen 80 default_server;
    location /api/ {
        proxy_pass http://127.0.0.1:8079;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
systemctl enable --now nginx

# 4) systemd 서비스 3개 등록 (빌드·env 파일 준비 후 실행해야 서비스가 정상 기동됨)
cp $ROOT/deploy/tg-backend.service /etc/systemd/system/
cp $ROOT/deploy/tg-frontend.service /etc/systemd/system/
cp $ROOT/deploy/tg-rag-search.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tg-backend tg-frontend tg-rag-search

echo "세팅 완료 — README의 '빌드'와 'env 파일' 단계를 마친 뒤: sudo systemctl start tg-backend tg-frontend tg-rag-search"
