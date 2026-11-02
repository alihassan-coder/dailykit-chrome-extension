// Screens talk to the account service in the background through messages, and follow its public state
// (published in storage.session) live. Screens never see the data key.
import { ACCOUNT_STATE_KEY, type AccountRequest, type AccountResponse, type AccountState } from '@toolbelt/core';
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

export function requestAccount(req: AccountRequest): Promise<AccountResponse> {
	return browser.runtime.sendMessage(req) as Promise<AccountResponse>;
}

export function useAccount() {
	const [account, setAccount] = useState<AccountState | null>(null);

	useEffect(() => {
		let alive = true;
		requestAccount({ type: 'account:status' })
			.then((r) => alive && setAccount(r.account))
			// The background was restarting or unreachable: the next published state (storage.session) still arrives.
			.catch((e: unknown) => console.warn('Toolbelt: account status unavailable', e));
		const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
			if (area === 'session' && changes[ACCOUNT_STATE_KEY]?.newValue) {
				setAccount(changes[ACCOUNT_STATE_KEY].newValue as AccountState);
			}
		};
		browser.storage.onChanged.addListener(onChange);
		return () => {
			alive = false;
			browser.storage.onChanged.removeListener(onChange);
		};
	}, []);

	/** Sends a request and returns its error message, if any. */
	const send = useCallback(async (req: AccountRequest): Promise<{ error: string | null; recoveryKey?: string }> => {
		const res = await requestAccount(req);
		setAccount(res.account);
		return res.ok ? { error: null, recoveryKey: res.recoveryKey } : { error: res.error };
	}, []);

	return { account, send };
}
