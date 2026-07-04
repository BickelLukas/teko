"""Constants for the Teko integration."""

from datetime import timedelta

DOMAIN = "teko"

CONF_URL = "url"
CONF_TOKEN = "token"

# Polling only — no WebSocket push channel exists on the add-on side yet.
# TODO: replace with a WebSocket subscription once the add-on exposes one.
SCAN_INTERVAL = timedelta(seconds=60)

SUMMARY_PATH = "/api/ha/summary"
