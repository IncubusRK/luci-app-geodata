'use strict';
'require view';
'require form';
'require rpc';
'require ui';

const callSyncCron = rpc.declare({
	object: 'luci.geodata',
	method: 'sync_cron'
});

// Mirrors the server-side URL validation in /usr/share/geodata/common.uc.
function validateHttpsUrl(value) {
	if (!value || !/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~\/?#&=%+-]*)?$/.test(value))
		return _('The URL must start with https:// and contain no spaces or control characters.');
	return true;
}

return view.extend({
	render: function() {
		let m, s, o;

		m = new form.Map('geodata', _('Geodata settings'),
			_('Source and update schedule for the xray geodata files (geoip.dat / geosite.dat) in /usr/share/v2ray/.'));

		s = m.section(form.TypedSection, 'geodata', _('General'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.ListValue, 'source', _('Geodata source'),
			_('Loyalsoldier is the recommended default: it contains all required codes (including TELEGRAM) and keeps xray at about 250 MB of RAM. The runetfreedom geosite.dat is about 89 MB and makes xray use about 1.3 GB of RAM. v2fly geoip.dat lacks the TELEGRAM code, which breaks xray configurations using geoip:telegram (EOF error). Custom URLs must use HTTPS.'));
		o.value('loyalsoldier', 'Loyalsoldier');
		o.value('runetfreedom', 'runetfreedom');
		o.value('v2fly', 'v2fly');
		o.value('custom', _('Custom URLs'));
		o.default = 'loyalsoldier';
		o.rmempty = false;

		o = s.option(form.Value, 'custom_geoip_url', _('Custom geoip.dat URL'),
			_('HTTPS URL of a custom geoip.dat file.'));
		o.depends('source', 'custom');
		o.rmempty = false;
		o.validate = validateHttpsUrl;

		o = s.option(form.Value, 'custom_geosite_url', _('Custom geosite.dat URL'),
			_('HTTPS URL of a custom geosite.dat file. For the v2fly domain-list-community this is dlc.dat; it will be installed as geosite.dat.'));
		o.depends('source', 'custom');
		o.rmempty = false;
		o.validate = validateHttpsUrl;

		o = s.option(form.Flag, 'auto_update', _('Automatic updates'),
			_('Download and install geodata updates on a schedule (a cron job in /etc/crontabs/root). Disabled by default.'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.ListValue, 'auto_update_mode', _('Schedule'),
			_('How often the automatic update should run.'));
		o.value('daily', _('Daily'));
		o.value('weekly', _('Weekly'));
		o.default = 'daily';
		o.depends('auto_update', '1');
		o.rmempty = false;

		o = s.option(form.Value, 'auto_update_hour', _('Hour (0-23)'),
			_('Hour of day for the scheduled update (router local time).'));
		o.datatype = 'range(0,23)';
		o.default = '4';
		o.depends('auto_update', '1');
		o.rmempty = false;

		o = s.option(form.Value, 'auto_update_minute', _('Minute (0-59)'),
			_('Minute of the hour for the scheduled update.'));
		o.datatype = 'range(0,59)';
		o.default = '0';
		o.depends('auto_update', '1');
		o.rmempty = false;

		o = s.option(form.ListValue, 'auto_update_weekday', _('Day of week'),
			_('Day of week for the weekly schedule.'));
		o.value('0', _('Sunday'));
		o.value('1', _('Monday'));
		o.value('2', _('Tuesday'));
		o.value('3', _('Wednesday'));
		o.value('4', _('Thursday'));
		o.value('5', _('Friday'));
		o.value('6', _('Saturday'));
		o.default = '0';
		o.depends({ 'auto_update': '1', 'auto_update_mode': 'weekly' });
		o.rmempty = false;

		return m.render();
	},

	// After the UCI changes are applied, rewrite the marked crontab line
	// from the committed configuration (server-side validation).
	//
	// ui.changes.apply() commits UCI asynchronously and reloads the page a
	// few seconds later. Calling sync_cron right after apply() would race
	// the commit and read the old configuration, so the call is deferred to
	// the "uci-applied" event which LuCI dispatches once the commit is done.
	handleSaveApply: function(ev, mode) {
		document.addEventListener('uci-applied', function onApplied() {
			document.removeEventListener('uci-applied', onApplied);

			callSyncCron().then(function(res) {
				if (res && res.error)
					ui.addNotification(null, E('p', _('Failed to update the cron schedule: ') + res.error));
			}).catch(function(err) {
				ui.addNotification(null, E('p', _('Failed to update the cron schedule: ') + err));
			});
		});

		return this.handleSave(ev).then(function() {
			return ui.changes.apply(mode == '0');
		});
	}
});