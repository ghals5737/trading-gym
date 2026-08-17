-- 목업 응시 기록 — "리딩방 의존 초보자"의 전형적인 판단과 메모.
--
-- 메모(reason_memo)를 일부러 현실적으로 썼다. 진단 로직이 잡아내야 하는 신호가
-- 여기 다 들어있다: 리딩방 언급, 남들 다 산다, 무서워서, 평단 낮추려고, 감으로.
-- 5턴 중 4턴을 틀리고(2·5턴은 공시를 봤으면 맞출 수 있었음) 공시는 1번만 열어봤다.

BEGIN;

DELETE FROM exam_attempts WHERE user_key = 'demo';

INSERT INTO exam_attempts (paper_id, user_key, status, current_turn_no, starting_cash,
                           final_return_pct, aligned_count, started_at, completed_at)
SELECT id, 'demo', 'COMPLETED', 5, starting_cash, -31.40, 1,
       now() - interval '40 minutes', now() - interval '8 minutes'
FROM exam_papers WHERE code = 'MOCK-BASIC-01';

-- 턴 1: 리딩방 보고 추격매수 (모범답안 HOLD) — 오답
INSERT INTO exam_responses (attempt_id, turn_id, action, quantity, reason_memo,
                            viewed_disclosure, seconds_spent, is_aligned)
SELECT a.id, t.id, 'BUY', 200,
  '리딩방에서 오늘이 마지막 기회라고 해서 샀어요. 차트도 계속 우상향이고 다들 수익 인증하는 거 보니까 안 사면 나만 뒤처질 것 같았습니다.',
  false, 34, false
FROM exam_attempts a JOIN exam_turns t ON t.turn_no = 1 AND t.paper_id = a.paper_id
WHERE a.user_key = 'demo';

-- 턴 2: 공포에 매도 (모범답안 HOLD) — 오답
INSERT INTO exam_responses (attempt_id, turn_id, action, quantity, reason_memo,
                            viewed_disclosure, seconds_spent, is_aligned)
SELECT a.id, t.id, 'SELL', 120,
  '너무 무서워서 다 팔았어요. 뉴스에서 서킷브레이커 얘기 나오고 커뮤니티에도 반토막 인증만 올라와서 더 떨어질 것 같았습니다. 일단 지키고 봐야죠.',
  false, 21, false
FROM exam_attempts a JOIN exam_turns t ON t.turn_no = 2 AND t.paper_id = a.paper_id
WHERE a.user_key = 'demo';

-- 턴 3: 물타기 (모범답안 SELL) — 오답
INSERT INTO exam_responses (attempt_id, turn_id, action, quantity, reason_memo,
                            viewed_disclosure, seconds_spent, is_aligned)
SELECT a.id, t.id, 'BUY', 200,
  '평단가를 낮추려고 추가매수 했습니다. 여기서 팔면 손실이 확정되니까 버티는 게 낫다고 생각했어요. 바이오는 원래 임상 뜨면 한 번에 오르잖아요.',
  false, 47, false
FROM exam_attempts a JOIN exam_turns t ON t.turn_no = 3 AND t.paper_id = a.paper_id
WHERE a.user_key = 'demo';

-- 턴 4: 테마주 추격 (모범답안 HOLD) — 오답
INSERT INTO exam_responses (attempt_id, turn_id, action, quantity, reason_memo,
                            viewed_disclosure, seconds_spent, is_aligned)
SELECT a.id, t.id, 'BUY', 300,
  '실검 1위에 다들 사는 분위기라 그냥 느낌이 좋았어요. 정책 수혜주라니까 더 갈 것 같아서 일단 탔습니다.',
  false, 12, false
FROM exam_attempts a JOIN exam_turns t ON t.turn_no = 4 AND t.paper_id = a.paper_id
WHERE a.user_key = 'demo';

-- 턴 5: 공시를 열어보고 매수 (모범답안 BUY) — 정답
INSERT INTO exam_responses (attempt_id, turn_id, action, quantity, reason_memo,
                            viewed_disclosure, seconds_spent, is_aligned)
SELECT a.id, t.id, 'BUY', 150,
  '공시 열어보니까 매출도 늘고 자사주도 산다고 해서 분위기랑 실제 숫자가 다른 것 같았습니다. 그래서 조금만 사봤어요.',
  true, 96, true
FROM exam_attempts a JOIN exam_turns t ON t.turn_no = 5 AND t.paper_id = a.paper_id
WHERE a.user_key = 'demo';

COMMIT;
