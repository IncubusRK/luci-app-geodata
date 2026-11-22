# luci-app-geodata

LuCI app for managing Xray geodata files (`geoip.dat` / `geosite.dat`) on a
running OpenWrt router: pick a source, download updates with integrity checks,
view file status, schedule automatic updates via cron.

**English** | [Русский](#русский)

## English

### Features

- **Sources**: Loyalsoldier (default, recommended), runetfreedom, v2fly, or
  custom HTTPS URLs — with per-source warnings (RAM usage, missing `TELEGRAM`
  code, etc.) shown in the UI.
- **Safe updates**: detached worker (no rpcd timeout), HTTPS-only URL
  validation, protobuf sanity check, SHA-256, atomic install via `rename()`.
- **Status page**: file presence/size/mtime/SHA-256, update progress, xray
  service state, cron entries.
- **Cron schedule**: daily/weekly auto-update; only one marked crontab line is
  managed, other entries are untouched.
- **Safe restart**: only the *running* xray service is restarted
  (`xray_core` or `xray` init); a stopped proxy is never started by the app.
- Works with `xray_core` (luci-app-xray) and passwall via the canonical
  `/usr/share/v2ray/` paths. OpenClash keeps its own geodata — update it
  separately in OpenClash settings.
- i18n: English source strings, full Russian translation (`luci-i18n-geodata-ru`).

Not a fork of `v2ray-geodata`: it updates files already installed on the
router, it does not fetch data at firmware build time.

### Requirements

`luci-base`, `rpcd`, `rpcd-mod-ucode`, `ucode`, `ucode-mod-fs`, `ucode-mod-uci`,
`uclient-fetch`, `ca-bundle`, plus any `libustream-*` TLS backend for HTTPS
(usually present with LuCI).

### Install

Build in an OpenWrt tree (feeds `luci` required):

```sh
git clone https://github.com/IncubusRK/luci-app-geodata.git package/luci-app-geodata
make menuconfig   # LuCI → Applications → luci-app-geodata
make package/luci-app-geodata/compile V=s
```

Or install a prebuilt package on the router (OpenWrt 24.10+ uses apk):

```sh
apk add --allow-untrusted ./luci-app-geodata-1.0.0-r1.apk
```

Menu: **Services → Geodata** (Status / Settings).
CLI: `ubus call luci.geodata status`, `ubus call luci.geodata update '{"files":"all"}'`.

### Documentation

Detailed Russian documentation (package layout, security model, troubleshooting):
[docs/details.ru.md](docs/details.ru.md).

Developed for the [IncubusRK/openwrt-bpi-r4](https://github.com/IncubusRK/openwrt-bpi-r4)
firmware recipe (Banana Pi BPI-R4, OpenWrt main / LuCI master); verified on
device 2026-11-22.

### License

GPL-2.0-or-later — see [LICENSE](LICENSE).

---

## Русский

LuCI-приложение для управления файлами геоданных Xray (`geoip.dat` /
`geosite.dat`) на работающем роутере OpenWrt: выбор источника, скачивание
обновлений с проверкой целостности, статус файлов, автообновление по cron.

### Возможности

- **Источники**: Loyalsoldier (по умолчанию, рекомендуемый), runetfreedom,
  v2fly или произвольные HTTPS-URL; предупреждения по каждому источнику
  (расход ОЗУ, отсутствие кода `TELEGRAM` и т.п.) показываются в UI.
- **Безопасное обновление**: отсоединяемый worker (без таймаута rpcd),
  валидация URL (только HTTPS), sanity-check структуры protobuf, SHA-256,
  атомарная установка через `rename()`.
- **Страница Status**: наличие/размер/mtime/SHA-256 файлов, ход обновления,
  состояние службы xray, записи cron.
- **Расписание cron**: ежедневно/еженедельно; управляется только одна помеченная
  строка crontab, остальные не затрагиваются.
- **Безопасный рестарт**: перезапускается только *запущенная* служба xray
  (`xray_core` или `xray`); остановленный прокси приложение не включает.
- Совместимо с `xray_core` (luci-app-xray) и passwall через канонические пути
  `/usr/share/v2ray/`. OpenClash хранит свои копии геоданных — обновляйте их
  отдельно в настройках OpenClash.
- Локализация: исходные строки EN, полный русский перевод (`luci-i18n-geodata-ru`).

Это не форк `v2ray-geodata`: приложение обновляет уже установленные на роутере
файлы, а не качает данные при сборке прошивки.

### Зависимости

`luci-base`, `rpcd`, `rpcd-mod-ucode`, `ucode`, `ucode-mod-fs`, `ucode-mod-uci`,
`uclient-fetch`, `ca-bundle` + любой TLS-бэкенд `libustream-*` для HTTPS
(обычно уже установлен вместе с LuCI).

### Установка

Сборка в дереве OpenWrt (нужен фид `luci`):

```sh
git clone https://github.com/IncubusRK/luci-app-geodata.git package/luci-app-geodata
make menuconfig   # LuCI → Applications → luci-app-geodata
make package/luci-app-geodata/compile V=s
```

Или готовый пакет на роутере (OpenWrt 24.10+ использует apk):

```sh
apk add --allow-untrusted ./luci-app-geodata-1.0.0-r1.apk
```

Меню: **Services → Geodata** (Status / Settings).
Консоль: `ubus call luci.geodata status`, `ubus call luci.geodata update '{"files":"all"}'`.

### Документация

Подробная документация (состав пакета, модель безопасности, устранение
неполадок): [docs/details.ru.md](docs/details.ru.md).

Разработано для рецепта прошивки
[IncubusRK/openwrt-bpi-r4](https://github.com/IncubusRK/openwrt-bpi-r4)
(Banana Pi BPI-R4, OpenWrt main / LuCI master); проверено на устройстве
2026-11-22.

### Лицензия

GPL-2.0-or-later — см. [LICENSE](LICENSE).
