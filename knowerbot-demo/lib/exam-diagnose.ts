// 모의고사 응답 메모 → 행동 패턴 진단.
//
// mock-exam/quizgen.py의 PATTERNS를 그대로 옮긴 것이다. 프론트에서 다시 구현한 이유는,
// 사용자가 화면에서 실제로 적은 메모로 진단이 나와야 데모가 설득력이 있어서다
// (미리 계산된 진단을 보여주면 "내 답과 무관한 결과"가 된다).
// 백엔드가 붙으면 이 함수는 지우고 서버 진단 결과를 받아 쓰면 된다 —
// 규칙이 같으므로 결과도 같다.

export type ExamAction = 'BUY' | 'SELL' | 'HOLD';

export interface DiagnoseInput {
  turnNo: number;
  stockName: string;
  action: ExamAction;
  reasonMemo: string;
  viewedDisclosure: boolean;
  isAligned: boolean;
  outcomeChangePct: number;
}

export interface DiagnosisEvidence {
  turnNo: number;
  stockName: string;
  action: ExamAction;
  matched: string[];
  memo: string;
  wasWrong: boolean;
}

export interface Diagnosis {
  patternKey: string;
  label: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  hitCount: number;
  evidence: DiagnosisEvidence[];
}

interface PatternRule {
  key: string;
  label: string;
  keywords: string[];
  actions: ExamAction[];
}

const PATTERNS: PatternRule[] = [
  {
    key: 'NEWS_CHASING',
    label: '뉴스·리딩방 보고 추격매수',
    keywords: ['리딩방', '추천', '마지막 기회', '지금 아니면', '실검', '수혜주', '테마'],
    actions: ['BUY'],
  },
  {
    key: 'HERD_FOLLOWING',
    label: '남들 따라 사기(군중심리)',
    keywords: ['다들', '남들', '분위기', '뒤처', '인증', '1위', '너도나도'],
    actions: ['BUY'],
  },
  {
    key: 'PANIC_SELL',
    label: '공포에 매도',
    keywords: ['무서', '불안', '더 떨어질', '겁', '폭락', '던지'],
    actions: ['SELL'],
  },
  {
    key: 'LOSS_AVERSION',
    label: '손실 확정 회피·물타기',
    keywords: ['평단', '물타기', '추가매수', '버티', '손실이 확정', '본전'],
    actions: ['BUY', 'HOLD'],
  },
  {
    key: 'NO_RATIONALE',
    label: '근거 없는 판단',
    keywords: ['느낌', '감으로', '그냥', '왠지', '찍', '몰라'],
    actions: ['BUY', 'SELL', 'HOLD'],
  },
];

const SEVERITY_ORDER: Record<Diagnosis['severity'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function diagnose(rows: DiagnoseInput[]): Diagnosis[] {
  const found: Diagnosis[] = [];

  for (const pattern of PATTERNS) {
    const evidence: DiagnosisEvidence[] = [];
    for (const row of rows) {
      if (!pattern.actions.includes(row.action)) continue;
      const matched = pattern.keywords.filter((kw) => row.reasonMemo.includes(kw));
      if (matched.length === 0) continue;
      evidence.push({
        turnNo: row.turnNo,
        stockName: row.stockName,
        action: row.action,
        matched,
        memo: row.reasonMemo,
        wasWrong: !row.isAligned,
      });
    }
    if (evidence.length === 0) continue;
    const wrong = evidence.filter((e) => e.wasWrong).length;
    found.push({
      patternKey: pattern.key,
      label: pattern.label,
      severity: wrong >= 2 ? 'HIGH' : wrong === 1 ? 'MEDIUM' : 'LOW',
      hitCount: evidence.length,
      evidence,
    });
  }

  // 공시 미확인은 메모가 아니라 행동으로 판정 — 매수 판단의 절반 이상에서 안 봤으면 잡는다.
  const buys = rows.filter((r) => r.action === 'BUY');
  const unchecked = buys.filter((r) => !r.viewedDisclosure);
  if (buys.length > 0 && unchecked.length / buys.length >= 0.5) {
    found.push({
      patternKey: 'DISCLOSURE_IGNORED',
      label: '공시 확인 없이 판단',
      severity: unchecked.length >= 3 ? 'HIGH' : 'MEDIUM',
      hitCount: unchecked.length,
      evidence: unchecked.map((r) => ({
        turnNo: r.turnNo,
        stockName: r.stockName,
        action: r.action,
        matched: ['공시 미확인'],
        memo: r.reasonMemo,
        wasWrong: !r.isAligned,
      })),
    });
  }

  found.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.hitCount - a.hitCount,
  );
  return found;
}
