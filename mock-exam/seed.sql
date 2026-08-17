-- 모의고사 목업 데이터 (문제지 1종 5턴 + 초보자 전형 응시 1건)
--
-- 5개 턴은 각각 다른 실수 패턴을 유도하도록 짰다. 그래야 응시 한 번으로
-- 여러 진단이 나오고, 진단마다 다른 edu_chunks를 근거로 퀴즈가 생성된다.
--   1턴 급등주 + 리딩방      → 추격매수(NEWS_CHASING) 유도, 공시에 적자·CB
--   2턴 급락장 우량주        → 공포매도(PANIC_SELL) 유도, 공시는 무차입·실적개선
--   3턴 보유종목 -18%        → 물타기(LOSS_AVERSION) 유도
--   4턴 테마주 + 커뮤니티     → 군중심리(HERD_FOLLOWING) 유도
--   5턴 조용한 실적개선주     → 공시를 봐야 정답이 보임 (DISCLOSURE_IGNORED 확인)
-- 종목명은 전부 익명 처리 — 실제 기업 평판 이슈를 피하기 위함(SPEC의 향후과제 항목).

BEGIN;

-- 재실행 가능하게 기존 데모 데이터 정리 (edu_* 는 건드리지 않음)
DELETE FROM exam_papers WHERE code = 'MOCK-BASIC-01';
DELETE FROM investor_profiles WHERE user_key = 'demo';

-- ── 투자성향 (온보딩 결과) ──────────────────────────────────
INSERT INTO investor_profiles
  (user_key, risk_type, knowledge_level, info_habit, risk_score, knowledge_score, info_habit_score, summary)
VALUES
  ('demo', 'AGGRESSIVE', 'BEGINNER', 'DEPENDENT', 17, 4, 7,
   '짧은 기간에 수익을 내고 싶어 하고, 투자 정보는 주로 SNS·리딩방에서 얻는 편이에요. 손실이 났을 때 더 사는 쪽을 고르는 경향이 있어 레버리지 사용에 특히 주의가 필요해요.');

-- ── 문제지 ────────────────────────────────────────────────
INSERT INTO exam_papers (code, title, description, difficulty, total_turns, starting_cash)
VALUES ('MOCK-BASIC-01', '첫 모의고사 · 판단의 근거 찾기',
        '차트와 그날의 뉴스만 보고 매수·매도·관망을 고르고, 왜 그렇게 판단했는지 적어보세요. 제출하면 실제 결과가 공개됩니다.',
        'NORMAL', 5, 10000000);

-- ── 턴 1: 급등주 + 리딩방 (추격매수 유도) ──────────────────
INSERT INTO exam_turns
 (paper_id, turn_no, stock_name, sector, as_of_date, price, holding_qty, avg_buy_price,
  chart_points, news, disclosure, outcome_points, outcome_change_pct, outcome_summary,
  ideal_action, ideal_rationale, learning_point)
SELECT id, 1, '종목 A', '코스닥 · 2차전지 장비', '2021-03-15', 22400, 0, NULL,
 '[{"d":"2021-01-04","c":11800},{"d":"2021-01-18","c":12400},{"d":"2021-02-01","c":13900},
   {"d":"2021-02-15","c":15600},{"d":"2021-03-02","c":18200},{"d":"2021-03-09","c":20500},
   {"d":"2021-03-15","c":22400}]'::jsonb,
 '[{"tag":"리딩방","title":"\"지금 못 타면 평생 후회합니다. 오늘이 마지막 기회\""},
   {"tag":"커뮤니티","title":"다들 얼마 벌었어요? 여기 안 산 사람이 바보라는 분위기"},
   {"tag":"뉴스","title":"대형 수주 기대감에 신고가 경신… 증권가 목표가 상향"}]'::jsonb,
 '{"rows":[{"label":"최근 매출","value":"전년 대비 -34%","tone":"bad"},
           {"label":"영업이익","value":"3년 연속 적자","tone":"bad"},
           {"label":"전환사채(CB)","value":"300억 발행 — 잠재 매도 물량","tone":"bad"},
           {"label":"최대주주 지분","value":"최근 일부 매각 공시","tone":"bad"}],
   "note":"판단 시점에 이미 공개돼 있던 전자공시(DART) 내용이에요."}'::jsonb,
 '[{"d":"2021-03-15","c":22400},{"d":"2021-04-01","c":20600},{"d":"2021-04-15","c":17100},
   {"d":"2021-05-03","c":15800},{"d":"2021-06-01","c":13100},{"d":"2021-06-15","c":13000}]'::jsonb,
 -42.00, '3개월 뒤 -42%였어요. 기대감 뉴스와 달리 공시에는 이미 적자와 잠재 매도 물량이 적혀 있었습니다.',
 'HOLD', '뉴스와 리딩방은 기대감을 말했지만 공시에는 매출 감소·연속 적자·CB 물량이 이미 있었어요. 분위기가 뜨거울수록 공시부터 확인하고, 확신이 없으면 사지 않는 것도 판단이에요.',
 '이슈에 휩쓸리지 않고 공시로 확인하기'
FROM exam_papers WHERE code = 'MOCK-BASIC-01';

-- ── 턴 2: 급락장 우량주 (공포매도 유도) ────────────────────
INSERT INTO exam_turns
 (paper_id, turn_no, stock_name, sector, as_of_date, price, holding_qty, avg_buy_price,
  chart_points, news, disclosure, outcome_points, outcome_change_pct, outcome_summary,
  ideal_action, ideal_rationale, learning_point)
SELECT id, 2, '종목 B', '코스피 · 대형 전자', '2020-03-23', 42300, 120, 54000,
 '[{"d":"2020-02-03","c":55500},{"d":"2020-02-17","c":57200},{"d":"2020-03-02","c":54000},
   {"d":"2020-03-09","c":47500},{"d":"2020-03-16","c":42300},{"d":"2020-03-23","c":36800}]'::jsonb,
 '[{"tag":"뉴스","title":"외국인 사상 최대 순매도… 서킷브레이커 발동"},
   {"tag":"커뮤니티","title":"\"계좌 반토막 인증\" 공포가 극에 달한 분위기"},
   {"tag":"리딩방","title":"\"지금이라도 던지세요. 반등은 없습니다\""}]'::jsonb,
 '{"rows":[{"label":"재무구조","value":"사실상 무차입 경영","tone":"good"},
           {"label":"분기 실적","value":"시장 예상치 상회","tone":"good"},
           {"label":"배당","value":"전년 수준 유지 발표","tone":"good"},
           {"label":"현금성 자산","value":"업종 최상위","tone":"good"}],
   "note":"주가는 급락했지만 기업의 재무 상태는 훼손되지 않은 상태였어요."}'::jsonb,
 '[{"d":"2020-03-23","c":36800},{"d":"2020-04-06","c":41200},{"d":"2020-04-20","c":45900},
   {"d":"2020-05-11","c":49800},{"d":"2020-06-01","c":53500},{"d":"2020-07-13","c":63400}]'::jsonb,
 72.28, '4개월 뒤 +72%였어요. 공포가 극에 달했을 때가 오히려 저점이었습니다.',
 'HOLD', '시장 전체가 급락한 것이지 이 기업의 재무가 나빠진 게 아니었어요. 공포에 휩쓸려 파는 것이 가장 비싼 선택이 되는 전형적인 상황입니다.',
 '시장 공포와 기업 가치를 구분하기'
FROM exam_papers WHERE code = 'MOCK-BASIC-01';

-- ── 턴 3: 보유종목 -18% (물타기 유도) ──────────────────────
INSERT INTO exam_turns
 (paper_id, turn_no, stock_name, sector, as_of_date, price, holding_qty, avg_buy_price,
  chart_points, news, disclosure, outcome_points, outcome_change_pct, outcome_summary,
  ideal_action, ideal_rationale, learning_point)
SELECT id, 3, '종목 C', '코스닥 · 바이오', '2022-05-20', 8200, 200, 10000,
 '[{"d":"2022-03-04","c":10000},{"d":"2022-03-25","c":9700},{"d":"2022-04-08","c":9200},
   {"d":"2022-04-22","c":8900},{"d":"2022-05-06","c":8500},{"d":"2022-05-20","c":8200}]'::jsonb,
 '[{"tag":"커뮤니티","title":"\"평단 낮추면 금방 회복합니다\" 물타기 인증 글 다수"},
   {"tag":"뉴스","title":"주요 파이프라인 임상 3상 지연 공시… 일정 불투명"},
   {"tag":"리딩방","title":"\"지금이 마지막 물타기 찬스, 두 배로 담으세요\""}]'::jsonb,
 '{"rows":[{"label":"임상 일정","value":"3상 결과 발표 1년 이상 연기","tone":"bad"},
           {"label":"현금 보유","value":"1년치 운영자금 미만","tone":"bad"},
           {"label":"유상증자","value":"검토 중 공시","tone":"bad"},
           {"label":"매출","value":"제품 매출 없음 (개발 단계)","tone":"bad"}],
   "note":"손실 중일수록 공시를 다시 확인해야 판단이 흔들리지 않아요."}'::jsonb,
 '[{"d":"2022-05-20","c":8200},{"d":"2022-06-10","c":7100},{"d":"2022-07-01","c":6300},
   {"d":"2022-08-05","c":5400},{"d":"2022-09-02","c":4800},{"d":"2022-10-07","c":4500}]'::jsonb,
 -45.12, '5개월 뒤 -45%였어요. 물타기를 했다면 손실이 두 배가 됐을 상황입니다.',
 'SELL', '임상 지연·현금 부족·유상증자 검토가 겹친 상태로, 하락에 근거가 있었어요. 평단가를 낮추는 것은 손실을 줄이는 게 아니라 위험을 키우는 것입니다. 손절 기준을 미리 정해두는 게 핵심이에요.',
 '물타기의 위험과 손절 원칙 세우기'
FROM exam_papers WHERE code = 'MOCK-BASIC-01';

-- ── 턴 4: 테마주 + 커뮤니티 (군중심리 유도) ────────────────
INSERT INTO exam_turns
 (paper_id, turn_no, stock_name, sector, as_of_date, price, holding_qty, avg_buy_price,
  chart_points, news, disclosure, outcome_points, outcome_change_pct, outcome_summary,
  ideal_action, ideal_rationale, learning_point)
SELECT id, 4, '종목 D', '코스닥 · 정책 테마', '2023-07-26', 15800, 0, NULL,
 '[{"d":"2023-07-03","c":6200},{"d":"2023-07-10","c":7100},{"d":"2023-07-17","c":9800},
   {"d":"2023-07-20","c":12400},{"d":"2023-07-24","c":14100},{"d":"2023-07-26","c":15800}]'::jsonb,
 '[{"tag":"커뮤니티","title":"실시간 검색어 1위, \"이번 주에만 150% 올랐다\" 인증 릴레이"},
   {"tag":"리딩방","title":"\"목표가 3만원, 아직 반도 안 왔습니다\""},
   {"tag":"뉴스","title":"정책 수혜 기대감에 관련주 무더기 상한가… 과열 경고도"}]'::jsonb,
 '{"rows":[{"label":"해당 사업 매출","value":"전체 매출의 2% 미만","tone":"bad"},
           {"label":"주가 변동","value":"3주간 +155%","tone":"bad"},
           {"label":"거래정지","value":"투자경고종목 지정 예고","tone":"bad"},
           {"label":"임원 보유주식","value":"최근 매도 공시","tone":"bad"}],
   "note":"테마와 실제 사업의 연결고리가 얼마나 되는지 확인해야 해요."}'::jsonb,
 '[{"d":"2023-07-26","c":15800},{"d":"2023-08-02","c":11200},{"d":"2023-08-16","c":8400},
   {"d":"2023-09-01","c":7100},{"d":"2023-09-20","c":6400},{"d":"2023-10-11","c":5900}]'::jsonb,
 -62.66, '3개월 뒤 -62%였어요. 테마 관련 매출은 전체의 2%도 되지 않았습니다.',
 'HOLD', '3주 만에 155% 오른 뒤 남들이 다 산다는 이유로 들어가는 건 가장 늦게 타는 자리예요. 테마와 실제 매출의 연결고리를 확인하면 과열 여부가 보입니다.',
 '군중심리와 테마주 과열 구분하기'
FROM exam_papers WHERE code = 'MOCK-BASIC-01';

-- ── 턴 5: 조용한 실적개선주 (공시를 봐야 정답) ─────────────
INSERT INTO exam_turns
 (paper_id, turn_no, stock_name, sector, as_of_date, price, holding_qty, avg_buy_price,
  chart_points, news, disclosure, outcome_points, outcome_change_pct, outcome_summary,
  ideal_action, ideal_rationale, learning_point)
SELECT id, 5, '종목 E', '코스피 · 음식료', '2019-10-24', 7700, 0, NULL,
 '[{"d":"2019-08-01","c":9600},{"d":"2019-08-22","c":9100},{"d":"2019-09-05","c":8600},
   {"d":"2019-09-19","c":8300},{"d":"2019-10-10","c":7900},{"d":"2019-10-24","c":7700}]'::jsonb,
 '[{"tag":"커뮤니티","title":"\"이 종목은 끝났다\" 손절 인증 글이 줄줄이"},
   {"tag":"뉴스","title":"원자재 가격 급등 우려에 업종 전반 약세 지속"},
   {"tag":"리딩방","title":"\"지금이라도 던지세요. 반등은 없습니다\""}]'::jsonb,
 '{"rows":[{"label":"최근 매출","value":"전년 대비 +18%","tone":"good"},
           {"label":"영업이익률","value":"2분기 연속 개선","tone":"good"},
           {"label":"부채","value":"사실상 무차입 경영","tone":"good"},
           {"label":"자사주","value":"매입 계획 공시","tone":"good"}],
   "note":"분위기와 숫자가 정반대인 경우예요. 공시를 열어봐야 보입니다."}'::jsonb,
 '[{"d":"2019-10-24","c":7700},{"d":"2019-11-14","c":8200},{"d":"2019-12-05","c":8900},
   {"d":"2020-01-09","c":9600},{"d":"2020-02-06","c":10300},{"d":"2020-04-23","c":10500}]'::jsonb,
 36.36, '6개월 뒤 +36%였어요. 분위기는 최악이었지만 실적과 재무는 오히려 좋아지고 있었습니다.',
 'BUY', '커뮤니티와 리딩방은 끝났다고 했지만 공시 속 매출·이익률·자사주 매입은 정반대를 가리켰어요. 남들이 공포에 팔 때 숫자를 확인한 사람이 기회를 잡습니다.',
 '분위기가 아니라 숫자로 판단하기'
FROM exam_papers WHERE code = 'MOCK-BASIC-01';

COMMIT;
