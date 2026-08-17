import RewindClient from './rewind-client';

// 모의고사(리와인드) — 차트+뉴스로 판단하고 이유를 메모로 남기면, 그 메모를 분석해
// 습관을 진단하고 RAG로 만든 맞춤 문제를 준다.
// 지금은 mock-exam/export_mock.py가 만든 목업 JSON을 쓰고, 백엔드 API가 붙으면
// rewind-client.tsx의 import만 fetch로 바꾸면 된다.
export default function RewindPage() {
  return <RewindClient />;
}
