# EC2 배포 (t3.medium, 짧게 켰다 끄는 운영)

## 구성
- 프론트: Cloudflare Pages (`NEXT_PUBLIC_API_BASE=https://api.<도메인>` 설정)
- 백엔드+RAG 검색: EC2 t3.medium 1대 (systemd로 부팅 시 자동 기동 → 인스턴스 켜기만 하면 됨)
- DB: RDS(tg)
- HTTPS: `api.<도메인>`을 Cloudflare DNS 프록시(주황 구름)로 EC2에 연결 — TLS는 Cloudflare가 종단

## 최초 1회
1. 파일 업로드: jar(`backend/build/libs/*.jar`), `edu-rag-indexer/`(venv 포함 or 서버에서 pip install), `deploy/` → `/home/ec2-user/trading-gym/`
2. env 파일 2개 생성(chmod 600): `backend.env`(DB_PASSWORD, OPENAI_API_KEY, AI_PROVIDER, CORS_ALLOWED_ORIGINS), `rag.env`(DATABASE_URL=RDS)
3. `sudo bash deploy/setup-ec2.sh`
4. 보안그룹: 인바운드 80(Cloudflare→EC2), 22(내 IP). RDS 보안그룹엔 EC2 보안그룹만 허용.

## 평소 운영
- 켜기: EC2 콘솔에서 시작 → 서비스 자동 기동 (약 1~2분)
- 끄기: 중지 (디스크 요금만 과금)
- IP가 바뀌면: Cloudflare DNS의 api A레코드 갱신 (또는 Elastic IP 사용)
- RDS도 안 쓸 땐 중지 가능 (7일 후 자동 재시작 유의)

## 새 버전 배포
로컬에서 `./gradlew bootJar` → jar 교체 → `sudo systemctl restart tg-backend`
