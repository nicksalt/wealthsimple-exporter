/**
 * Integration tests for the background service worker's auth handling.
 * Verifies the CHECK_AUTH message flow reads the cookie on demand, that
 * auth data is never persisted to chrome.storage.local, and that stored
 * auth data from earlier versions is cleaned up on install (issue #3).
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

type MessageListener = (
  message: { type: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

const cookiesGet = vi.fn();
const storageSet = vi.fn().mockResolvedValue(undefined);
const storageGet = vi.fn().mockResolvedValue({});
const storageRemove = vi.fn().mockResolvedValue(undefined);

let messageListener: MessageListener;
let installedListener: () => void;

function mockAuthCookie(payload: object | string) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  cookiesGet.mockResolvedValue({ value: encodeURIComponent(raw) });
}

function sendCheckAuth(): Promise<{ authenticated: boolean }> {
  return new Promise((resolve) => {
    const keepChannelOpen = messageListener(
      { type: 'CHECK_AUTH' },
      {} as chrome.runtime.MessageSender,
      resolve as (response?: unknown) => void
    );
    // The listener must return true to keep the channel open for the async response
    expect(keepChannelOpen).toBe(true);
  });
}

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    cookies: { get: cookiesGet },
    storage: {
      local: { set: storageSet, get: storageGet, remove: storageRemove },
    },
    runtime: {
      onMessage: {
        addListener: (fn: MessageListener) => {
          messageListener = fn;
        },
      },
      onInstalled: {
        addListener: (fn: () => void) => {
          installedListener = fn;
        },
      },
    },
    downloads: {
      download: vi.fn(),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });

  // Importing registers the listeners captured above
  await import('../../src/background/index');
});

beforeEach(() => {
  cookiesGet.mockReset();
  storageSet.mockClear();
  storageRemove.mockClear();
});

describe('CHECK_AUTH message', () => {
  it('responds authenticated when the cookie contains a valid token', async () => {
    mockAuthCookie({
      access_token: 'test-access-token',
      identity_canonical_id: 'identity-123',
    });

    const response = await sendCheckAuth();

    expect(response).toEqual({ authenticated: true });
    expect(cookiesGet).toHaveBeenCalledWith({
      url: 'https://my.wealthsimple.com',
      name: '_oauth2_access_v2',
    });
  });

  it('responds not authenticated when the cookie is missing', async () => {
    cookiesGet.mockResolvedValue(null);

    const response = await sendCheckAuth();

    expect(response).toEqual({ authenticated: false });
  });

  it('responds not authenticated when the cookie value is empty', async () => {
    cookiesGet.mockResolvedValue({ value: '' });

    const response = await sendCheckAuth();

    expect(response).toEqual({ authenticated: false });
  });

  it('responds not authenticated when the cookie is not valid JSON', async () => {
    mockAuthCookie('not-json');

    const response = await sendCheckAuth();

    expect(response).toEqual({ authenticated: false });
  });

  it('responds not authenticated when the token fields are missing', async () => {
    mockAuthCookie({ identity_canonical_id: 'identity-123' });
    expect(await sendCheckAuth()).toEqual({ authenticated: false });

    mockAuthCookie({ access_token: 'test-access-token' });
    expect(await sendCheckAuth()).toEqual({ authenticated: false });
  });

  it('responds not authenticated when the cookie read fails', async () => {
    cookiesGet.mockRejectedValue(new Error('cookies API unavailable'));

    const response = await sendCheckAuth();

    expect(response).toEqual({ authenticated: false });
  });

  it('never persists auth data to chrome.storage.local', async () => {
    mockAuthCookie({
      access_token: 'test-access-token',
      identity_canonical_id: 'identity-123',
    });

    await sendCheckAuth();

    expect(storageSet).not.toHaveBeenCalled();
  });
});

describe('onInstalled storage cleanup', () => {
  it('removes auth data persisted by earlier versions', () => {
    installedListener();

    expect(storageRemove).toHaveBeenCalledWith(['authToken', 'identityId']);
  });
});
