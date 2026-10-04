#!/bin/sh
# Install this host's user services. Does not stop or start a running application.
set -eu
if [ "$(id -un)" != omid ]; then
  echo 'Run this installer as omid, without sudo.' >&2
  exit 1
fi
DEPLOY_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STORE_ROOT=/home/omid/projects/vinyl-store-management
UNIT_DIR=/home/omid/.config/systemd/user
test -x /usr/sbin/mariadbd
test -x /usr/bin/node
test -d "$STORE_ROOT/.data/mysql/mysql"
test -f "$STORE_ROOT/backend/.env"
test -f "$STORE_ROOT/node_modules/vite/bin/vite.js"
install -d -m 0755 "$UNIT_DIR"
for unit in vinyl-mysql.service vinyl-api.service vinyl-web.service vinyl-store.target; do
  install -m 0644 "$DEPLOY_DIR/systemd/$unit" "$UNIT_DIR/$unit"
done
systemd-analyze --user verify "$UNIT_DIR/vinyl-mysql.service" "$UNIT_DIR/vinyl-api.service" "$UNIT_DIR/vinyl-web.service" "$UNIT_DIR/vinyl-store.target"
systemctl --user daemon-reload
systemctl --user enable vinyl-store.target
loginctl --no-ask-password enable-linger omid
if [ "$(loginctl show-user omid -p Linger --value)" != yes ]; then
  echo 'Boot startup requires: sudo loginctl enable-linger omid' >&2
  exit 1
fi
echo 'Installed and enabled for boot, including before login. Stop any manual copy, then run: systemctl --user start vinyl-store.target'
