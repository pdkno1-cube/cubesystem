import { Metadata } from 'next';
import { InfraCostClient } from './infra-cost-client';

export const metadata: Metadata = {
  title: '인프라 비용 대시보드 | The Master OS',
  description: '모든 외부 서비스의 요금제·사용량·예상 비용을 한눈에 확인합니다.',
};

export default function InfraCostPage() {
  return <InfraCostClient />;
}
