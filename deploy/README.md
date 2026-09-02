# EC2 통짜 배포 (t3.medium, 프론트+백엔드+RAG 한 대)

```
Cloudflare DNS(프록시, 선택) → EC2:80 nginx ─┬─ /    → Next.js  (:8088)
                                             ├─ /api → Spring   (:8079)
                                             └─ RAG는 내부 전용   (:8123)
                                                  ↓
                                             RDS (tg)
```

## 최초 1회 (EC2에서, 순서대로)

```bash
# 0) 코드 받기
cd ~ && git clone https://github.com/ghals5737/trading-gym.git trading-gym && cd trading-gym && git checkout hhm

# 1) 시스템 세팅 (스왑·런타임·nginx·systemd 등록)
sudo bash deploy/setup-ec2.sh

# 2) 백엔드 빌드
cd backend && ./gradlew clean bootJar && cd ..

# 3) 프론트 빌드 — NEXT_PUBLIC_API_BASE="" 가 핵심(같은 오리진 /api 상대경로 호출)
cd knowerbot-demo && npm ci && NEXT_PUBLIC_API_BASE="" npm run build && cd ..

# 4) RAG 서버 준비 (임베딩 모델은 첫 실행 때 자동 다운로드 ~500MB)
#    ⚠ torch는 반드시 CPU 전용으로 먼저 — 기본 설치는 CUDA(GPU) 라이브러리 수 GB를 받아 디스크가 참
cd edu-rag-indexer && python3.11 -m venv .venv
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements.txt && cd ..

# 5) 시크릿 env 파일 2개 (chmod 600)
cat > backend.env <<ENV
DB_PASSWORD=<RDS 비밀번호>
OPENAI_API_KEY=<키>
AI_PROVIDER=openai
ENV
cat > rag.env <<ENV
DATABASE_URL=postgresql://hrbc:<RDS 비밀번호>@snsb-dev.ccniq24yveck.ap-northeast-2.rds.amazonaws.com:5432/tg
ENV
chmod 600 backend.env rag.env

# 6) 기동
sudo systemctl start tg-backend tg-frontend tg-rag-search
systemctl status tg-backend tg-frontend tg-rag-search --no-pager
curl -s localhost:8079/api/ping && curl -s -o /dev/null -w "front:%{http_code}\n" localhost:8088
```

## AWS 쪽 체크리스트
- 보안그룹 인바운드: 80(전체 또는 Cloudflare IP), 22(내 IP만). **8079/8088/8123은 열지 않음**(nginx 뒤 내부 전용)
- RDS 보안그룹: EC2 보안그룹만 5432 허용으로 잠그기
- 도메인 쓰면: Cloudflare DNS A레코드(프록시 ON) → EC2 IP. HTTPS는 Cloudflare가 종단
- 중지→시작하면 퍼블릭 IP 바뀜: Elastic IP 권장

## 새 버전 배포
```bash
cd ~/trading-gym && git pull
cd backend && ./gradlew clean bootJar && cd ..                              # 백엔드 바뀐 경우
cd knowerbot-demo && NEXT_PUBLIC_API_BASE="" npm run build && cd ..         # 프론트 바뀐 경우
sudo systemctl restart tg-backend tg-frontend
```

## 짧게 켰다 끄는 운영
- 켜기: EC2 시작 → systemd가 3개 서비스 자동 기동(1~2분)
- 끄기: EC2 중지(디스크 요금만) · RDS도 안 쓸 땐 중지 가능(7일 후 자동 재시작 유의)

## 트러블슈팅
- pip 설치 중 "No space left on device": CUDA용 torch를 받다 디스크가 찬 것 —
  `.venv/bin/pip cache purge` 후 venv 지우고 위의 CPU 전용 순서로 재설치.
  루트 볼륨이 8GB면 20GB로 확장 권장(EBS 수정 → `sudo growpart /dev/xvda 1 && sudo xfs_growfs /`)
- 빌드 중 멈춤/죽음: 스왑 확인(`swapon --show`), 빌드는 한 번에 하나씩
- 502: 해당 서비스 로그 `journalctl -u tg-backend -n 50` (frontend/rag 동일)
- 검색이 첫 요청만 느림: 임베딩 모델 로드 중 — 정상
