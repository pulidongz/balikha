#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root
require_ubuntu_2404

DEPLOY_USER="${DEPLOY_USER:-deploy}"
# No fallback: the public key is required. Refuse to create a passwordless,
# keyless sudo user (that would be a backdoor).
: "${DEPLOY_PUBKEY:?Set DEPLOY_PUBKEY to the deploy user PUBLIC SSH key, e.g. DEPLOY_PUBKEY=\$(cat ~/.ssh/id_ed25519.pub)}"

log "Setting timezone to UTC and enabling NTP later (70-timesync)."
timedatectl set-timezone UTC

log "apt update + full-upgrade (this can take a few minutes)."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get full-upgrade -y
apt-get install -y --no-install-recommends \
  openssh-server ufw fail2ban unattended-upgrades ca-certificates curl gnupg \
  acl htop
# openssh-server is explicit (not assumed) so the ufw `OpenSSH` app profile
# is guaranteed present in 30-firewall.sh (Issue 4).

if id "$DEPLOY_USER" >/dev/null 2>&1; then
  log "User '$DEPLOY_USER' already exists -- skipping creation."
else
  log "Creating non-root deploy user '$DEPLOY_USER'."
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"

# Key-only user -> password sudo is unusable, so grant passwordless sudo via
# a VALIDATED drop-in (Issue 8, resolved with user). The SSH key is therefore
# the sole gate to root -- acceptable for a single-operator deploy user.
SUDOERS="/etc/sudoers.d/90-${DEPLOY_USER}"
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$DEPLOY_USER" > "$SUDOERS"
chmod 440 "$SUDOERS"
visudo -cf "$SUDOERS" || { rm -f "$SUDOERS"; die "Invalid sudoers drop-in -- removed $SUDOERS."; }

log "Installing the deploy user's authorized_keys (idempotent)."
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
ensure_line "$DEPLOY_PUBKEY" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"

# Create the secrets dir 4B will use (root-owned, 700). 4A places NO secrets.
install -d -m 700 -o root -g root /etc/balikha

log "Base OS + deploy user ready. Public IP: $(curl -fsS --max-time 5 https://api.ipify.org || echo unknown)"
log "NEXT: open a NEW terminal and confirm: ssh ${DEPLOY_USER}@<this-host>"
