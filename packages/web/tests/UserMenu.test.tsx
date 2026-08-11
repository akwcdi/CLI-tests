// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserMenu } from '../src/components/UserMenu.tsx';
import { makeUser, renderAt } from './helpers.tsx';

const onSignOut = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

const open = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Taro/ }));
  return user;
};

describe('UserMenu', () => {
  it('既定では閉じていて、名前と頭文字だけを出す', () => {
    renderAt(<UserMenu user={makeUser({ name: 'Taro' })} onSignOut={onSignOut} />);

    const trigger = screen.getByRole('button', { name: /Taro/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('押すと開き、メール（機械の値）と項目を出す', async () => {
    renderAt(
      <UserMenu user={makeUser({ name: 'Taro', email: 'taro@example.com' })} onSignOut={onSignOut} />,
    );

    await open();

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Taro/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('taro@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '自分のアカウント' })).toHaveAttribute(
      'href',
      '/users/u1',
    );
  });

  it('もう一度押すと閉じる', async () => {
    renderAt(<UserMenu user={makeUser({ name: 'Taro' })} onSignOut={onSignOut} />);

    const user = await open();
    await user.click(screen.getByRole('button', { name: /Taro/ }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('外側をクリックすると閉じる', async () => {
    renderAt(<UserMenu user={makeUser({ name: 'Taro' })} onSignOut={onSignOut} />);

    const user = await open();
    await user.click(screen.getByTestId('usermenu-backdrop'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape で閉じる', async () => {
    renderAt(<UserMenu user={makeUser({ name: 'Taro' })} onSignOut={onSignOut} />);

    const user = await open();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape 以外のキーでは閉じない', async () => {
    renderAt(<UserMenu user={makeUser({ name: 'Taro' })} onSignOut={onSignOut} />);

    const user = await open();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('サインアウトを押すと通知する', async () => {
    renderAt(<UserMenu user={makeUser({ name: 'Taro' })} onSignOut={onSignOut} />);

    const user = await open();
    await user.click(screen.getByRole('menuitem', { name: 'サインアウト' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('名前が空でも頭文字は 1 文字出る', () => {
    renderAt(<UserMenu user={makeUser({ name: '' })} onSignOut={onSignOut} />);

    expect(screen.getByRole('button')).toHaveTextContent('?');
  });
});
