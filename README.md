# luci-app-geodata

LuCI-приложение для управления файлами геоданных Xray (`geoip.dat` и
`geosite.dat`): выбор источника, скачивание обновлений с проверкой целостности,
просмотр состояния файлов (размер, mtime, SHA-256) и автоматическое обновление
по расписанию через cron.

Приложение не является форком `v2ray-geodata`: оно не тянет данные при сборке
прошивки, а обновляет уже установленные файлы на работающем роутере.

## Состав пакета

| Путь | Назначение |
| --- | --- |
| `Makefile` | Пакет LuCI (`luci.mk`), зависимости, сборка `luci-i18n-geodata-ru` |
| `htdocs/luci-static/resources/view/geodata/status.js` | Страница **Status**: состояние файлов, задание обновления, cron, сервис xray |
| `htdocs/luci-static/resources/view/geodata/settings.js` | Страница **Settings**: источник, пользовательские URL, расписание |
| `root/usr/share/rpcd/ucode/luci.geodata` | rpcd-плагин (ubus-объект `luci.geodata`): `status`, `update`, `sync_cron` |
| `root/usr/share/geodata/common.uc` | Общий ucode-модуль: источники, валидация URL, sanity-check, sha256, состояние |
| `root/usr/libexec/geodata-update` | Отсоединяемый worker обновления (ucode) |
| `root/usr/share/rpcd/acl.d/luci-app-geodata.json` | ACL: `read` — `status`, `write` — `update`/`sync_cron`, UCI `geodata` |
| `root/usr/share/luci/menu.d/luci-app-geodata.json` | Меню LuCI: Services → Geodata → Status/Settings |
| `root/etc/config/geodata` | UCI-конфигурация (conffile) |
| `root/etc/uci-defaults/50_luci-geodata` | Сброс кэшей LuCI и reload rpcd при первой установке |
| `po/templates/geodata.pot`, `po/ru/geodata.po` | Шаблон и русский перевод (домен `geodata`) |
| `xgettext.sh` | Перегенерация `po/templates/geodata.pot` из JS-исходников |

Зависимости: `luci-base`, `rpcd`, `rpcd-mod-ucode`, `ucode`, `ucode-mod-fs`,
`ucode-mod-uci`, `uclient-fetch`, `ca-bundle`.

Для HTTPS нужен любой TLS-бэкенд `libustream-*` (`libustream-openssl` или
`libustream-mbedtls`) — обычно уже установлен вместе с LuCI. Без него
`uclient-fetch` не сможет скачать файлы по `https://`.

## Источники геоданных

Все предустановленные источники скачиваются по HTTPS с GitHub:

| Источник | geoip.dat | geosite.dat |
| --- | --- | --- |
| `loyalsoldier` (по умолчанию) | `https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat` | `.../geosite.dat` |
| `runetfreedom` | `https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geoip.dat` | `.../geosite.dat` |
| `v2fly` | `https://github.com/v2fly/geoip/releases/latest/download/geoip.dat` | `https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat` |

Предупреждения (показываются и в UI):

* **Loyalsoldier** — рекомендуемый вариант: содержит все нужные коды, включая
  `TELEGRAM`; xray занимает около 250 МБ ОЗУ.
* **runetfreedom** — `geosite.dat` около 89 МБ, xray с ним использует около
  **1,3 ГБ ОЗУ**. На роутерах с 512 МБ–1 ГБ ОЗУ это может привести к OOM.
* **v2fly** — в `geoip.dat` нет кода `TELEGRAM`. Конфигурации xray с
  `geoip:telegram` не запускаются (ошибка `EOF`). Для `geosite.dat`
  используется `dlc.dat` из domain-list-community, он устанавливается как
  `geosite.dat`.
* **custom** — произвольные HTTPS-URL. Разрешён только `https://`, без
  userinfo (`user@host`), пробелов и управляющих символов. Скачанный файл
  проходит проверку структуры protobuf перед установкой.

## Установка

### Готовая сборка (opkg, OpenWrt 23.05 и старше)

```sh
opkg update
opkg install ./luci-app-geodata_1.0.0-1_all.ipk
# при необходимости русский перевод:
opkg install ./luci-i18n-geodata-ru_*.ipk
```

### Готовая сборка (apk, OpenWrt 24.10+ / 25.x)

```sh
apk add --allow-untrusted ./luci-app-geodata-1.0.0-r1.apk
apk add --allow-untrusted ./luci-i18n-geodata-ru-*.apk
```

После установки откройте **LuCI → Services → Geodata** (может потребоваться
перезагрузка страницы или `service rpcd reload`).

### Сборка в дереве OpenWrt

```sh
cd openwrt
git clone <этот-репозиторий> package/luci-app-geodata

# LuCI → Applications → luci-app-geodata = M/y
# LuCI → Translations → Russian (CONFIG_LUCI_LANG_ru) — для luci-i18n-geodata-ru
make menuconfig

make package/luci-app-geodata/compile V=s
# или собрать образ целиком
make -j$(nproc)
```

`luci-i18n-geodata-ru` создаётся только при включённом `CONFIG_LUCI_LANG_ru`
(стандартное поведение `luci.mk`).

## Использование

### Status

* Таблица файлов: наличие, размер, время изменения, SHA-256.
* Кнопки **Update** для каждого файла и **Update all**.
* Ход выполнения задания: прогресс, результат по каждому файлу, перезапуск
  xray.
* Состояние источника, URL скачивания, init-скриптов xray и записи cron.
* Предупреждения выбранного источника (RAM, TELEGRAM, custom).

### Settings

* `source` — `loyalsoldier` / `runetfreedom` / `v2fly` / `custom`.
* `custom_geoip_url`, `custom_geosite_url` — только при `source=custom`,
  проверяются на клиенте и повторно на сервере.
* `auto_update` — включить автоматические обновления (по умолчанию выключено).
* `auto_update_mode` — `daily` или `weekly`.
* `auto_update_hour` (0–23), `auto_update_minute` (0–59),
  `auto_update_weekday` (0–6, только для `weekly`).

После **Save & Apply** приложение перезаписывает в `/etc/crontabs/root` одну
помеченную строку (`# luci-app-geodata`) и перезагружает cron, если служба
включена. Остальные строки crontab не затрагиваются.

Ручное обновление из консоли:

```sh
ubus call luci.geodata status
ubus call luci.geodata update '{"files":"all"}'
/usr/libexec/geodata-update geosite     # напрямую, без rpcd
logger -t geodata -p user.info "test"   # проверить syslog
```

Журнал обновлений пишется в syslog с тегом `geodata`
(`logread -e geodata`).

## Безопасность и надёжность

* **Отсоединяемый worker.** rpcd обрывает запрос по таймауту (30 с), а
  скачивание 89 МБ может идти минутами. Метод `update` только проверяет
  аргументы и запускает `/usr/libexec/geodata-update` в фоне
  (`/bin/sh -c 'exec ... &'`), сразу возвращая `{started:true}`. Прогресс
  публикуется в `/var/run/geodata-update.json`, UI опрашивает `status`.
  Повторный запуск блокируется: worker проверяет `running` + живой PID.
* **Без shell-инъекций.** Все внешние команды (`uclient-fetch`, `sha256sum`,
  `kill`, init-скрипты) вызываются через `system()`/`popen()` с **массивом
  аргументов**, то есть через `execvp()` без `/bin/sh`. Строка шелла
  используется только для фонового запуска с фиксированным текстом команды,
  а выбор файла передаётся позиционным аргументом (`"$@"`).
* **Валидация URL.** Только `https://`, ASCII без пробелов и управляющих
  символов (в ucode регэкспы компилируются с `REG_NEWLINE`, поэтому такие
  символы отсекаются отдельной проверкой), allowlist хостов для предустановок,
  проверка на клиенте и на сервере.
* **Проверка скачанного файла.** Перед установкой выполняется sanity-check
  структуры protobuf (`GeoIPList`/`GeoSiteList`: поле 1 → длина → поле 1 →
  код), ограничение размера 4 КБ…512 МБ, затем SHA-256.
* **Атомарная установка.** Файл скачивается в `*.tmp` рядом с целевым и
  переименовывается `rename()` в пределах той же ФС; частично скачанный файл
  никогда не попадает в целевой путь.
* **Безопасный рестарт.** Перезапускается только реально запущенная служба
  xray — `xray_core` (luci-app-xray) или `xray` (пакет xray-core); проверяются
  оба, рестартится тот, что running. Включённая, но остановленная служба не
  стартует — «прозрачный прокси» не включается сам.
* **Cron.** Значения расписания приводятся к целым в допустимых диапазонах на
  сервере (`cron_field`), в crontab попадает только `sprintf('%d ...')`, файл
  пишется атомарно и получает права `0600`.

## Интеграция с xray_core и OpenClash

* Канонический путь файлов — `/usr/share/v2ray/geoip.dat` и
  `/usr/share/v2ray/geosite.dat`. Пакеты `v2ray-geodata`/`v2ray-geosite`
  создают на них симлинки из `/usr/share/xray/`, поэтому `xray_core`
  (luci-app-xray) и `passwall` видят обновлённые файлы без дополнительной
  настройки. Симлинки не перезаписываются: `rename()` выполняется по пути
  `/usr/share/v2ray/...`.
* После успешного обновления worker перезапускает запущенную службу xray:
  `/etc/init.d/xray_core` (luci-app-xray) или `/etc/init.d/xray` (пакет
  `feeds/packages/net/xray-core`) — проверяются оба. Прочие init-скрипты
  (например, `homeproxy`) приложение не трогает — перезапустите вручную.
* **OpenClash** хранит собственные копии geodata (в своём каталоге и в
  `clash`-формате). Обновления этого приложения их не меняют; обновляйте
  geodata OpenClash отдельно в его настройках.

## Устранение неполадок

| Симптом | Что проверить |
| --- | --- |
| `worker_missing` | `/usr/libexec/geodata-update` существует и исполняем (`chmod +x`) |
| `download_failed` | DNS/шлюз роутера, `uclient-fetch -O /tmp/t.dat <url>`, наличие `libustream-*` и `ca-bundle` |
| `sanity_failed` | Источник отдал HTML/заглушку (captive portal, зеркало) или файл обрезан |
| `already_running` | Предыдущее обновление ещё идёт; состояние: `ubus call luci.geodata status` |
| cron не срабатывает | `/etc/init.d/cron enable && /etc/init.d/cron start`, `crontab -l` |
| нет русского языка | установлен `luci-i18n-geodata-ru`, выбран язык в System → Language |

## Разработка

* Исходные строки — английские (`_('...')` в JS). Шаблон:
  `./xgettext.sh` (нужен `xgettext`), перевод: `po/ru/geodata.po`,
  проверка: `msgfmt --check -o /dev/null po/ru/geodata.po`.
* Линт JS: `node --check htdocs/luci-static/resources/view/geodata/*.js`.
* ucode-файлы можно проверить интерпретатором `ucode -c` (импортируемые
  модули используют синтаксис `export`, а не `return {...}`).

## Лицензия

GPL-2.0-or-later, см. `LICENSE`.