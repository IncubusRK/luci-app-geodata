# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (C) 2026 IncubusRK
#
# LuCI application for managing xray geodata files
# (/usr/share/v2ray/geoip.dat and /usr/share/v2ray/geosite.dat).
#
# Works both as part of the OpenWrt build tree (package/luci-app-geodata)
# and when cloned standalone into package/ (e.g. by a CI diy-part2 script).

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-geodata
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI Geodata Manager (xray geoip.dat / geosite.dat)
LUCI_DESCRIPTION:=LuCI application for selecting the source of xray geodata \
	(geoip.dat / geosite.dat), downloading updates with integrity checks, \
	viewing file status (size / sha256 / mtime) and scheduling automatic updates.
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-ucode +ucode +ucode-mod-fs +ucode-mod-uci \
	+uclient-fetch +ca-bundle
LUCI_PKGARCH:=all

PKG_LICENSE:=GPL-2.0-or-later
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=IncubusRK
LUCI_URL:=https://github.com/IncubusRK/luci-app-geodata

# Source strings are English; po/ru provides the Russian translation
# (built as luci-i18n-geodata-ru, enabled via CONFIG_LUCI_LANG_ru).
LUCI_LANGUAGES:=ru

include $(TOPDIR)/feeds/luci/luci.mk

define Package/$(PKG_NAME)/conffiles
/etc/config/geodata
endef

# call BuildPackage - OpenWrt buildroot signature
# (luci.mk already evaluates BuildPackage for the app and its i18n packages)