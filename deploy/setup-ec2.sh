#!/usr/bin/env bash
# EC2(Amazon Linux 2023, t3.medium) 최초 1회 세팅 스크립트 — sudo로 실행
set -euo pipefail

# 1) 스왑 2GB — 임베딩 모델 로드 피크 대비
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2) 런타임: Java 21 + Python 3.11 + nginx
dnf install -y java-21-amazon-corretto-headless python3.11 python3.11-pip nginx

# 3) nginx — Cloudflare(HTTPS 종단) → EC2:80 → 백엔드:8079 프록시
cat > /etc/nginx/conf.d/tg.conf <<'NGINX'
server {
    listen 80 default_server;
    location / {
        proxy_pass http://127.0.0.1:8079;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
systemctl enable --now nginx

# 4) systemd 서비스 등록 (jar·코드·env 파일을 /home/ec2-user/trading-gym 에 올려둔 뒤 실행)
cp /home/ec2-user/trading-gym/deploy/tg-backend.service /etc/systemd/system/
cp /home/ec2-user/trading-gym/deploy/tg-rag-search.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tg-backend tg-rag-search

echo "완료 — 상태 확인: systemctl status tg-backend tg-rag-search"
