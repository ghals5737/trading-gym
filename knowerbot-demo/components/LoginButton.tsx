'use client';

export default function LoginButton({
  className,
  children = '로그인',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => document.body.classList.add('login-open')}
    >
      {children}
    </button>
  );
}
