import { submitTurn, type ExamAction, type SubmitTurnRequest } from './exam-api';

// 테스트용 자동 응답 — 모의고사 5턴을 손으로 푸는 게 번거로워서 만든 개발 편의 기능.
// 화면의 "빠른 채우기" 버튼이 이걸 쓴다(개발 모드에서만 노출).
//
// 메모는 진단 규칙(ExamDiagnosisRules)이 잡아내야 하는 표현을 일부러 넣어뒀다.
// 그래야 자동으로 채워도 리포트·퀴즈가 의미 있는 결과로 나온다.

export interface AutofillPreset {
  key: string;
  label: string;
  description: string;
  // 턴 번호 순서대로. 턴 수가 프리셋보다 많으면 마지막 항목을 반복한다.
  answers: { action: ExamAction; memo: string; viewedDisclosure: boolean }[];
}

export const AUTOFILL_PRESETS: AutofillPreset[] = [
  {
    key: 'beginner',
    label: '초보자 (진단 많이 나옴)',
    description: '리딩방·군중심리·물타기·공포매도를 골고루 — 진단이 여러 개 잡히는 기본 테스트',
    answers: [
      {
        action: 'BUY',
        memo: '리딩방에서 마지막 기회라고 하고 다들 사는 분위기라 저도 샀어요',
        viewedDisclosure: false,
      },
      {
        action: 'SELL',
        memo: '너무 무서워서 다 팔았어요. 더 떨어질 것 같아 던졌습니다',
        viewedDisclosure: false,
      },
      {
        action: 'BUY',
        memo: '평단가를 낮추려고 추가매수 했어요. 버티면 회복될 것 같아서요',
        viewedDisclosure: false,
      },
      {
        action: 'BUY',
        memo: '실검 1위에 다들 사는 분위기라 그냥 느낌이 좋았어요',
        viewedDisclosure: false,
      },
      {
        action: 'BUY',
        memo: '공시를 보니 매출이 늘고 자사주도 산다고 해서 숫자가 분위기와 달랐어요',
        viewedDisclosure: true,
      },
    ],
  },
  {
    key: 'careful',
    label: '신중한 투자자 (진단 거의 없음)',
    description: '전부 공시를 확인하고 근거를 적은 경우 — 진단이 안 잡히는 경로 테스트',
    answers: [
      { action: 'HOLD', memo: '공시를 보니 3년 연속 적자라 기대감만으로 오른 것 같아 지켜보겠습니다', viewedDisclosure: true },
      { action: 'HOLD', memo: '재무는 멀쩡한데 시장 전체가 빠진 상황이라 팔 이유가 없다고 판단했어요', viewedDisclosure: true },
      { action: 'SELL', memo: '임상 지연에 현금도 부족해서 하락에 근거가 있다고 보고 정리합니다', viewedDisclosure: true },
      { action: 'HOLD', memo: '테마 관련 매출이 2%도 안 돼서 지금 가격은 근거가 없다고 봤어요', viewedDisclosure: true },
      { action: 'BUY', memo: '매출과 이익률이 개선되고 자사주까지 매입해서 저평가라고 판단했습니다', viewedDisclosure: true },
    ],
  },
];

export interface AutofillProgress {
  turnNo: number;
  total: number;
}

// 남은 턴을 순서대로 제출한다. 서버가 현재 턴을 들고 있으므로 여기서는 순서대로 쏘기만 하면 된다.
export async function autofillExam(
  attemptId: string,
  preset: AutofillPreset,
  startTurnNo: number,
  totalTurns: number,
  onProgress?: (progress: AutofillProgress) => void,
): Promise<void> {
  for (let turnNo = startTurnNo; turnNo <= totalTurns; turnNo += 1) {
    const answer = preset.answers[Math.min(turnNo - 1, preset.answers.length - 1)];
    const request: SubmitTurnRequest = {
      action: answer.action,
      reasonMemo: answer.memo,
      viewedDisclosure: answer.viewedDisclosure,
    };
    onProgress?.({ turnNo, total: totalTurns });
    // 매도는 보유 수량이 없으면 서버가 400을 준다 — 그 턴만 관망으로 바꿔 재시도한다.
    try {
      await submitTurn(attemptId, request);
    } catch {
      await submitTurn(attemptId, { ...request, action: 'HOLD' });
    }
  }
}
