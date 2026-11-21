// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 IncubusRK
//
// Shared helpers for luci-app-geodata.
// Used by the rpcd plugin (/usr/share/rpcd/ucode/luci.geodata) and by the
// detached update worker (/usr/libexec/geodata-update).
//
// This file is an ucode *module*: current ucode releases only accept the
// ES-module "export" syntax in imported files, a trailing
// "return { ... }" object is rejected with "return must be inside
// function body".
//
// All external commands are executed with argument arrays (system()/popen()),
// never through a shell with interpolated user input.

'use strict';

import { access, open, popen, readfile, stat, writefile } from 'fs';

export const GEOIP_PATH   = '/usr/share/v2ray/geoip.dat';
export const GEOSITE_PATH = '/usr/share/v2ray/geosite.dat';
export const STATE_FILE   = '/var/run/geodata-update.json';
export const HASH_CACHE   = '/var/run/geodata-hash.json';
export const CRONTAB      = '/etc/crontabs/root';
export const CRON_MARKER  = 'luci-app-geodata';
export const WORKER       = '/usr/libexec/geodata-update';

// Preset sources. "hosts" is the allowlist applied to the *configured* URL
// (redirects, e.g. GitHub releases -> objects.githubusercontent.com, are
// followed by uclient-fetch itself).
export const PRESETS = {
	loyalsoldier: {
		geoip:   'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat',
		geosite: 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat',
		hosts:   [ 'github.com' ],
		warnings: []
	},
	runetfreedom: {
		geoip:   'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geoip.dat',
		geosite: 'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geosite.dat',
		hosts:   [ 'raw.githubusercontent.com' ],
		warnings: [ 'ram' ]
	},
	v2fly: {
		geoip:   'https://github.com/v2fly/geoip/releases/latest/download/geoip.dat',
		geosite: 'https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat',
		hosts:   [ 'github.com' ],
		warnings: [ 'telegram' ]
	}
};

// Validate a download URL. HTTPS only; no whitespace, control characters,
// userinfo ("@") or backslashes; optional port; conservative path charset.
// When "hosts" is given, the hostname must match the allowlist exactly.
export function valid_url(url, hosts) {
	if (type(url) != 'string' || length(url) < 12 || length(url) > 2048)
		return false;

	// ucode compiles regexes with REG_NEWLINE, so "$" also matches before a
	// newline and a negated class never matches one. Reject whitespace and
	// control characters explicitly before the anchored syntax check.
	if (match(url, /[[:space:][:cntrl:]]/))
		return false;

	if (!match(url, /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~\/?#&=%+-]*)?$/))
		return false;

	let m = match(url, /^https:\/\/([A-Za-z0-9.-]+)/);
	if (!m)
		return false;

	let host = lc(m[1]);
	if (index(host, '.') < 0 || substr(host, 0, 1) == '.' ||
	    substr(host, length(host) - 1, 1) == '.')
		return false;

	if (hosts != null && index(hosts, host) < 0)
		return false;

	return true;
}

// Resolve the effective download URLs for the configured source.
// Returns { urls, warnings, error }; error is a translation key or null.
export function resolve_urls(source, custom_geoip, custom_geosite) {
	let preset = PRESETS[source];
	if (preset) {
		return {
			urls: { geoip: preset.geoip, geosite: preset.geosite },
			warnings: preset.warnings,
			error: null
		};
	}

	if (source == 'custom') {
		if (!valid_url(custom_geoip, null))
			return { urls: {}, warnings: [ 'custom' ], error: 'invalid_custom_geoip_url' };
		if (!valid_url(custom_geosite, null))
			return { urls: {}, warnings: [ 'custom' ], error: 'invalid_custom_geosite_url' };
		return {
			urls: { geoip: custom_geoip, geosite: custom_geosite },
			warnings: [ 'custom' ],
			error: null
		};
	}

	return { urls: {}, warnings: [], error: 'unknown_source' };
}

// Compute sha256 of a file using busybox sha256sum (argument array, no shell).
export function sha256_file(path) {
	let fp = popen([ 'sha256sum', path ]);
	if (!fp)
		return null;

	let out = fp.read('all');
	let rc = fp.close();
	if (rc != 0 || !out)
		return null;

	let m = match(out, /^([0-9a-f]{64})/);
	return m ? m[1] : null;
}

// File status with a sha256 cache keyed by (size, mtime) so that repeated
// status calls do not re-hash multi-megabyte files.
export function file_info(path) {
	let st = stat(path);
	if (!st)
		return { path: path, exists: false, size: 0, mtime: 0, sha256: null };

	let cache = {};
	try {
		cache = json(readfile(HASH_CACHE) || '{}') || {};
	}
	catch (e) {
		cache = {};
	}

	let c = cache[path];
	let hash = null;
	if (c && c.size == st.size && c.mtime == st.mtime) {
		hash = c.sha256;
	}
	else {
		hash = sha256_file(path);
		cache[path] = { size: st.size, mtime: st.mtime, sha256: hash };
		writefile(HASH_CACHE, sprintf('%J', cache));
	}

	return { path: path, exists: true, size: st.size, mtime: st.mtime, sha256: hash };
}

// Remember a freshly computed hash (used by the worker after installation).
export function cache_hash(path, size, mtime, hash) {
	let cache = {};
	try {
		cache = json(readfile(HASH_CACHE) || '{}') || {};
	}
	catch (e) {
		cache = {};
	}
	cache[path] = { size: size, mtime: mtime, sha256: hash };
	writefile(HASH_CACHE, sprintf('%J', cache));
}

// Basic sanity check that a downloaded file looks like a v2ray geodata
// protobuf (GeoIPList / GeoSiteList):
//   file     := 0x0A <varint entry_len> <entry bytes> ...
//   entry    := 0x0A <varint code_len> <country_code/domain> ...
// Catches HTML error pages, truncated downloads and empty files. This is
// intentionally lightweight; it is not a full protobuf parse.
export function sanity_check(path) {
	let st = stat(path);
	if (!st)
		return { ok: false, reason: 'missing' };
	if (st.size < 4096)
		return { ok: false, reason: 'too_small' };
	if (st.size > 536870912)
		return { ok: false, reason: 'too_large' };

	let fp = open(path, 'r');
	if (!fp)
		return { ok: false, reason: 'unreadable' };

	let head = fp.read(256);
	fp.close();

	if (!head || length(head) < 8)
		return { ok: false, reason: 'truncated' };

	let pos = 0;
	if (ord(substr(head, pos, 1)) != 0x0a)
		return { ok: false, reason: 'not_protobuf' };
	pos++;

	let entry_len = 0, shift = 0, b;
	while (pos < length(head)) {
		b = ord(substr(head, pos, 1));
		pos++;
		entry_len |= (b & 0x7f) << shift;
		if (!(b & 0x80))
			break;
		shift += 7;
		if (shift > 28)
			return { ok: false, reason: 'bad_varint' };
	}
	if (entry_len < 4 || entry_len > st.size)
		return { ok: false, reason: 'bad_length' };

	if (pos >= length(head) || ord(substr(head, pos, 1)) != 0x0a)
		return { ok: false, reason: 'bad_entry' };
	pos++;

	let code_len = 0;
	shift = 0;
	while (pos < length(head)) {
		b = ord(substr(head, pos, 1));
		pos++;
		code_len |= (b & 0x7f) << shift;
		if (!(b & 0x80))
			break;
		shift += 7;
		if (shift > 14)
			return { ok: false, reason: 'bad_varint' };
	}
	if (code_len < 1 || code_len > 64 || pos + code_len > length(head))
		return { ok: false, reason: 'bad_code' };

	let code = substr(head, pos, code_len);
	if (match(code, /[[:space:][:cntrl:]]/))
		return { ok: false, reason: 'bad_code' };
	if (!match(code, /^[A-Za-z0-9._-]+$/))
		return { ok: false, reason: 'bad_code' };

	return { ok: true, code: code };
}

// xray_core init script state (from luci-app-xray).
export function xray_state() {
	let installed = access('/etc/init.d/xray_core', 'x');
	return {
		installed: !!installed,
		enabled:   !!(installed && system([ '/etc/init.d/xray_core', 'enabled' ]) == 0),
		running:   !!(installed && system([ '/etc/init.d/xray_core', 'running' ]) == 0)
	};
}

export function read_state() {
	try {
		return json(readfile(STATE_FILE) || 'null');
	}
	catch (e) {
		return null;
	}
}

export function write_state(state) {
	writefile(STATE_FILE, sprintf('%J', state));
}

export function pid_alive(pid) {
	return (pid != null && pid > 0 && system([ 'kill', '-0', '' + pid ]) == 0);
}

// Current geodata cron entry state (marked lines in /etc/crontabs/root).
export function cron_status() {
	let content = readfile(CRONTAB) || '';
	let line = null;
	let enabled = false;

	for (let l in split(content, '\n')) {
		if (index(l, CRON_MARKER) < 0)
			continue;
		line = l;
		enabled = !match(l, /^\s*#/);
	}

	return {
		present: (line != null),
		enabled: enabled,
		line: line,
		daemon_running: !!(access('/etc/init.d/cron', 'x') &&
		                   system([ '/etc/init.d/cron', 'running' ]) == 0)
	};
}

export function uci_bool(val) {
	if (val == null)
		return false;
	switch ('' + val) {
	case '1': case 'yes': case 'on': case 'true': case 'enabled':
		return true;
	default:
		return false;
	}
}

// Coerce a cron scheduling field to a bounded integer. Anything that is not
// a plain decimal in [lo, hi] falls back to dflt, so no UCI/RPC input can
// inject newlines or shell metacharacters into the crontab.
export function cron_field(val, lo, hi, dflt) {
	val = '' + (val != null ? val : '');

	// "^[0-9]+$" alone is not enough: ucode regexes use REG_NEWLINE, so
	// "5\n9" would match the "5" prefix. Reject whitespace/control bytes
	// as well, so only a plain decimal can get through.
	if (!match(val, /^[0-9]+$/) || match(val, /[[:space:][:cntrl:]]/))
		return dflt;

	let n = int(val);
	return (n < lo || n > hi) ? dflt : n;
}