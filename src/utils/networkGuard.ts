import {assertOnlineState} from '../domain/backup';

export function assertBrowserOnline(actionLabel?: string): void {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  assertOnlineState(online, actionLabel);
}
