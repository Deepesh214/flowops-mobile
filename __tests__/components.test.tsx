import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { TaskCard } from '@/components/TaskCard';
import { LoginForm } from '@/features/auth/LoginForm';
import { routeForNotification } from '@/features/notifications/notifications';
import { useAppStore } from '@/store/appStore';

import { makeTask } from './helpers';

describe('LoginForm', () => {
  it('shows inline validation and does not submit invalid input', async () => {
    const onSubmit = jest.fn();
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(screen.getByText('Enter your email.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a friendly error for invalid credentials and does not crash', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('Email or password is incorrect.'));
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('login-email'), 'alex@flowops.app');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'wrongpass');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(onSubmit).toHaveBeenCalledWith('alex@flowops.app', 'wrongpass');
    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy();
  });

  it('disables the button while submitting', async () => {
    let resolve!: () => void;
    const onSubmit = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    await render(
      <LoginForm
        onSubmit={onSubmit}
        initialEmail="alex@flowops.app"
        initialPassword="flowops123"
      />,
    );
    // Not awaited: the press only settles once the submit promise resolves.
    const firstPress = fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Signing in…')).toBeTruthy();
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    await firstPress;
    expect(screen.getByText('Sign in')).toBeTruthy();
  });
});

describe('TaskCard', () => {
  it('renders text labels for priority and status and calls onPress with the id', async () => {
    const onPress = jest.fn();
    await render(
      <TaskCard
        task={makeTask({ id: 'x', priority: 'high', status: 'blocked' })}
        onPress={onPress}
      />,
    );
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Blocked')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('task-card-x'));
    expect(onPress).toHaveBeenCalledWith('x');
  });

  it('shows a sync indicator only when pending or failed', async () => {
    const { rerender } = await render(<TaskCard task={makeTask()} onPress={jest.fn()} />);
    expect(screen.queryByText('Pending sync')).toBeNull();
    await rerender(<TaskCard task={makeTask({ syncState: 'pending' })} onPress={jest.fn()} />);
    expect(screen.getByText('Pending sync')).toBeTruthy();
    await rerender(<TaskCard task={makeTask({ syncState: 'failed' })} onPress={jest.fn()} />);
    expect(screen.getByText('Sync failed')).toBeTruthy();
  });
});

describe('ConnectivityBanner', () => {
  afterEach(() =>
    useAppStore.setState({ isConnected: true, simulateOffline: false, pendingCount: 0 }),
  );

  it('is hidden online and visible offline with the pending count', async () => {
    useAppStore.setState({ isConnected: true, pendingCount: 0 });
    await render(<ConnectivityBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    await act(async () => useAppStore.setState({ isConnected: false, pendingCount: 2 }));
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(screen.getByText(/2 changes will sync when you reconnect/)).toBeTruthy();
  });
});

describe('notification deep links', () => {
  it('opens the intended task', () => {
    expect(routeForNotification({ kind: 'due', taskId: 'abc' })).toBe('/task/abc');
    expect(routeForNotification({ kind: 'overdue', taskId: 'abc' })).toBe('/task/abc');
    expect(routeForNotification({ kind: 'sync' })).toBe('/profile');
    expect(routeForNotification({ kind: 'due' })).toBeNull();
    expect(routeForNotification(undefined)).toBeNull();
  });
});
