// Real-browser harness: the built extension in Chrome for Testing, against a local HTTPS fake of a site.
// Branded Chrome ignores --load-extension, so set CHROME to a Chrome for Testing binary.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';

export function selfSignedCert(host: string) {
	const dir = mkdtempSync(join(tmpdir(), 'tb-e2e-'));
	execFileSync('openssl', [
		'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${host}`,
		'-addext', `subjectAltName=DNS:${host}`, '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')
	], { stdio: 'ignore' });
	return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
}

export async function serveHtml(host: string, html: string): Promise<{ server: Server; port: number }> {
	const server = createServer(selfSignedCert(host), (_req, res) => {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.end(html);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('no port');
	return { server, port: address.port };
}

export async function launchWithExtension(extensionDir: string, map: { host: string; port: number }): Promise<Browser> {
	const executablePath = process.env.CHROME;
	if (!executablePath) throw new Error('Set CHROME to a Chrome for Testing binary (npx @puppeteer/browsers install chrome@stable)');
	return puppeteer.launch({
		executablePath,
		headless: true,
		pipe: true,
		enableExtensions: [extensionDir],
		args: [`--host-resolver-rules=MAP ${map.host}:443 127.0.0.1:${map.port}`, '--ignore-certificate-errors', '--no-first-run']
	});
}
