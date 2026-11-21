'use strict';
'require view';
'require rpc';
'require ui';
'require dom';
'require poll';

const callStatus = rpc.declare({
	object: 'luci.geodata',
	method: 'status'
});

const callUpdate = rpc.declare({
	object: 'luci.geodata',
	method: 'update',
	params: [ 'files' ]
});

const SOURCE_LABELS = {
	loyalsoldier: 'Loyalsoldier',
	runetfreedom: 'runetfreedom',
	v2fly: 'v2fly',
	custom: _('Custom URLs')
};

function fmtSize(n) {
	if (n == null)
		return '?';
	if (n < 1024)
		return n + ' B';
	if (n < 1048576)
		return (n / 1024).toFixed(1) + ' KiB';
	if (n < 1073741824)
		return (n / 1048576).toFixed(1) + ' MiB';
	return (n / 1073741824).toFixed(2) + ' GiB';
}

function pad(n) {
	return (n < 10 ? '0' : '') + n;
}

function fmtTime(epoch) {
	if (!epoch)
		return _('unknown');
	const d = new Date(epoch * 1000);
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
		' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

return view.extend({
	errmsg: function(key, detail) {
		const messages = {
			already_running: _('An update is already running.'),
			invalid_files: _('Invalid file selection.'),
			worker_missing: _('The update worker is missing or not executable.'),
			spawn_failed: _('Failed to start the update worker.'),
			worker_died: _('The update worker terminated unexpectedly.'),
			download_failed: _('Download failed'),
			sanity_failed: _('The file does not look like a valid geodata protobuf'),
			install_failed: _('Failed to install the file (atomic rename failed).'),
			hash_failed: _('Failed to compute SHA-256.'),
			url_invalid: _('No valid download URL is configured.'),
			invalid_custom_geoip_url: _('The custom geoip.dat URL is invalid (HTTPS is required).'),
			invalid_custom_geosite_url: _('The custom geosite.dat URL is invalid (HTTPS is required).'),
			unknown_source: _('Unknown geodata source.'),
			write_failed: _('Failed to write the crontab.')
		};
		let msg = messages[key] || key;
		if (detail)
			msg += ' (' + detail + ')';
		return msg;
	},

	warningText: function(key) {
		switch (key) {
		case 'ram':
			return _('Warning: the runetfreedom geosite.dat is about 89 MB. Xray with this file uses about 1.3 GB of RAM. The Loyalsoldier geosite.dat (about 11.5 MB) keeps xray at about 250 MB of RAM.');
		case 'telegram':
			return _('Warning: v2fly geoip.dat does not contain the TELEGRAM code. Xray configurations using geoip:telegram will fail to start (EOF error). Use Loyalsoldier or runetfreedom instead.');
		case 'custom':
			return _('Custom source: only HTTPS URLs are allowed. Downloaded files are checked for a valid geodata protobuf structure before installation.');
		default:
			return key;
		}
	},

	handleUpdate: function(files) {
		const self = this;
		return callUpdate(files).then(function(res) {
			if (res && res.error) {
				ui.addNotification(null, E('p', _('Failed to start the update: ') + self.errmsg(res.error)));
				return;
			}
			ui.addNotification(null, E('p', _('Update started. This may take a few minutes.')), 'info');
			self.startPolling();
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Failed to start the update: ') + err));
		});
	},

	startPolling: function() {
		if (this._pollFn)
			return;

		const self = this;
		this._pollStarted = Date.now();
		this._pollFn = poll.add(function() {
			return callStatus().then(function(st) {
				self.updatePage(st);

				const job = st.job;
				if (job && job.running)
					return;

				// Give the worker a moment to publish its initial state.
				if (!job && Date.now() - self._pollStarted < 15000)
					return;

				poll.remove(self._pollFn);
				self._pollFn = null;
				self.notifyJobDone(st);
			}).catch(function() {});
		}, 2);
	},

	notifyJobDone: function(st) {
		const job = st.job;
		if (!job) {
			ui.addNotification(null, E('p', this.errmsg('worker_died')));
			return;
		}

		let ok = true;
		for (let k in (job.results || {}))
			if (!job.results[k].ok)
				ok = false;

		let msg = ok ? _('Update finished successfully.') : _('Update finished with errors.');
		if (ok)
			msg += ' ' + (job.xray_restarted
				? _('xray_core was restarted.')
				: _('xray_core was not restarted (it is not running).'));
		ui.addNotification(null, E('p', msg), ok ? 'info' : 'warning');
	},

	buildFileTable: function(st) {
		const jobRunning = !!(st.job && st.job.running);
		const rows = [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('File')),
				E('th', { 'class': 'th' }, _('Size')),
				E('th', { 'class': 'th' }, _('Modified')),
				E('th', { 'class': 'th' }, _('SHA-256')),
				E('th', { 'class': 'th' }, '')
			])
		];

		[ 'geoip', 'geosite' ].forEach(function(name) {
			const f = (st.files && st.files[name]) || {};
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, name + '.dat'),
				E('td', { 'class': 'td' }, f.exists ? fmtSize(f.size) : _('Not installed')),
				E('td', { 'class': 'td' }, f.exists ? fmtTime(f.mtime) : '—'),
				E('td', { 'class': 'td' }, f.sha256
					? E('code', { 'style': 'font-size:85%; word-break:break-all' }, f.sha256)
					: '—'),
				E('td', { 'class': 'td' }, E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.createHandlerFn(this, 'handleUpdate', name),
					'disabled': jobRunning ? true : null
				}, _('Update')))
			]));
		}, this);

		return E('table', { 'class': 'table' }, rows);
	},

	buildJobSection: function(st) {
		const job = st.job;
		const jobRunning = !!(job && job.running);
		const nodes = [];

		nodes.push(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Update job')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(this, 'handleUpdate', 'all'),
					'disabled': jobRunning ? true : null
				}, _('Update all')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.createHandlerFn(this, 'handleRefresh'),
					'disabled': jobRunning ? true : null
				}, _('Refresh'))
			])
		]));

		if (!job) {
			nodes.push(E('div', { 'class': 'cbi-section' },
				E('em', _('No updates have been run yet.'))));
			return nodes;
		}

		if (jobRunning) {
			nodes.push(E('div', { 'class': 'cbi-section' }, [
				E('p', {}, [
					E('em', { 'class': 'spinning' }, _('Update in progress…')),
					' (', _('started'), ': ', fmtTime(job.started), ')'
				])
			]));
			return nodes;
		}

		const rows = [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('File')),
				E('th', { 'class': 'th' }, _('Result')),
				E('th', { 'class': 'th' }, _('SHA-256'))
			])
		];

		for (let name in (job.results || {})) {
			const r = job.results[name];
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, name + '.dat'),
				E('td', { 'class': 'td' }, r.ok
					? E('span', { 'style': 'color:green' }, _('OK'))
					: E('span', { 'style': 'color:red' }, this.errmsg(r.error, r.detail))),
				E('td', { 'class': 'td' }, r.sha256
					? E('code', { 'style': 'font-size:85%; word-break:break-all' }, r.sha256)
					: '—')
			]));
		}

		nodes.push(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Last update')),
			E('p', {}, [
				_('started'), ': ', fmtTime(job.started), ' · ',
				_('finished'), ': ', fmtTime(job.finished)
			]),
			E('table', { 'class': 'table' }, rows),
			E('p', {}, job.xray_restarted
				? _('xray_core was restarted.')
				: _('xray_core was not restarted (it is not running).'))
		]));

		return nodes;
	},

	buildContent: function(st) {
		const nodes = [];

		nodes.push(E('div', { 'class': 'cbi-map-descr' },
			_('Manage the xray geodata files geoip.dat and geosite.dat in /usr/share/v2ray/: choose a source, download updates and view file status.')));

		if (st.url_error)
			nodes.push(E('div', { 'class': 'alert-message warning' }, this.errmsg(st.url_error)));

		(st.warnings || []).forEach(function(w) {
			nodes.push(E('div', { 'class': 'alert-message warning' }, this.warningText(w)));
		}, this);

		nodes.push(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Files')),
			this.buildFileTable(st)
		]));

		const urls = st.urls || {};
		nodes.push(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Geodata source')),
			E('p', {}, [
				E('strong', SOURCE_LABELS[st.source] || st.source || '?'),
				' — ',
				E('a', { 'href': L.url('admin/services/geodata/settings') }, _('Change source'))
			]),
			E('p', {}, _('Download URLs:')),
			E('ul', {}, [
				E('li', {}, [ 'geoip.dat: ', E('code', { 'style': 'word-break:break-all' }, urls.geoip || '—') ]),
				E('li', {}, [ 'geosite.dat: ', E('code', { 'style': 'word-break:break-all' }, urls.geosite || '—') ])
			])
		]));

		const xr = st.xray || {};
		nodes.push(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Service status')),
			E('p', {}, [
				'xray_core: ',
				xr.installed ? _('installed') : _('not installed'), ', ',
				xr.enabled ? _('enabled') : _('disabled'), ', ',
				xr.running ? _('running') : _('stopped')
			]),
			E('p', { 'class': 'cbi-section-descr' },
				_('xray_core is restarted automatically after an update only if it is running. An enabled but stopped service is not started.')),
			E('p', { 'class': 'cbi-section-descr' },
				_('If you use OpenClash, note that it keeps its own geodata copies; update them separately in the OpenClash settings.'))
		]));

		const cron = st.cron || {};
		nodes.push(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Automatic updates')),
			E('p', {}, cron.present && cron.enabled
				? [_('Scheduled (cron): '), E('code', {}, cron.line || '')]
				: _('Not scheduled. Enable automatic updates on the Settings page.')),
			(cron.present && cron.enabled && !cron.daemon_running)
				? E('p', { 'class': 'alert-message warning' },
					_('The cron daemon is not running; enable the cron service for scheduled updates.'))
				: E('span')
		]));

		nodes.push.apply(nodes, this.buildJobSection(st));

		return nodes;
	},

	updatePage: function(st) {
		dom.content(this._root, this.buildContent(st));
	},

	handleRefresh: function() {
		const self = this;
		return callStatus().then(function(st) {
			self.updatePage(st);
		});
	},

	load: function() {
		return Promise.all([ callStatus() ]);
	},

	render: function(data) {
		const st = data[0] || {};
		this._root = E('div', { 'class': 'cbi-map', 'id': 'geodata-status' });
		this.updatePage(st);
		if (st.job && st.job.running)
			this.startPolling();
		return this._root;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});