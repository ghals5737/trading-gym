'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BotToggle from './BotToggle';
import LoginButton from './LoginButton';
import useLoggedIn from './useLoggedIn';
import { logout } from '../lib/auth';

const TABS = [
  { label: '리와인드', href: '/rewind' },
  { label: '스파링', href: '/simulation', tourId: 'nav-simulation' },
  { label: '마이 페이지', href: '/my', tourId: 'nav-my' },
  { label: '오늘의 PT', href: '/pt', tourId: 'nav-pt' },
  { label: '자료실', href: '/library', tourId: 'nav-library' },
];

export default function TopNav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  const loggedIn = useLoggedIn();

  return (
    <nav className="top-nav">
      <Link href="/dashboard" className="top-nav-brand" data-knower-swing-seat="">
        <span className="badge">짐</span>
        트레이딩 짐
      </Link>
      <div className="top-nav-tabs">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`top-nav-tab${active ? ' active' : ''}`}
              data-tour={tab.tourId}
              data-knower-seat=""
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="top-nav-right">
        <BotToggle />
        {loggedIn ? (
          <>
            {right}
            <button type="button" className="top-nav-logout" onClick={() => logout()}>
              로그아웃
            </button>
          </>
        ) : (
          <LoginButton className="btn btn-secondary btn-sm">로그인</LoginButton>
        )}
      </div>
    </nav>
  );
}
