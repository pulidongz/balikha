# 4A — Host Provisioning & Hardening Runbook

**Scope:** Single $5 / 1 GB Linode Nanode, production-only, Ubuntu 24.04 LTS.
No staging box — local `docker-compose.yml` is the pre-production environment.
All builds happen in CI (`.github/workflows/ci.yml`), never on this host, which
is what makes 1 GB + a 2 GB swap file viable: the box only runs `next start` +
PostgreSQL 16.

When traction appears, resize from the Linode dashboard (1 GB → 2/4 GB, one
reboot, same IP/disk) — starting tiny is not a lock-in.

---

## Prerequisites

- A **Linode account** (cloud.linode.com).
- An **SSH keypair** on your workstation. If you don't have one yet:
  ```bash
  ssh-keygen -t ed25519 -C "balikha-deploy"
  ```
  You will need the **public** key (`~/.ssh/id_ed25519.pub`) at Linode creation
  time and again when running the scripts.
- The domain **`balikha.art`** (DNS configuration is 4E, not this runbook).
- A **strong, generated password** for the PostgreSQL `balikha` role — store it
  in your secrets manager before you start (1Password, Bitwarden, etc.). You
  will pass it as `DB_PASSWORD` during the run.
- The contents of your deploy public key ready to paste:
  ```bash
  cat ~/.ssh/id_ed25519.pub
  ```

---

## 0. Create the Linode (skip if it already exists)

1. Log in to [cloud.linode.com](https://cloud.linode.com) → **Create** →
   **Linode**.
2. **Image:** Ubuntu 24.04 LTS.
3. **Region:** Singapore (`ap-southeast`).
4. **Plan:** Nanode 1 GB — $5/mo.
5. **Root password:** set a strong root password (used for Linode LISH console
   recovery — not for SSH login once hardening is applied).
6. **Add SSH key — REQUIRED:** paste your workstation public key here. This
   seeds `/root/.ssh/authorized_keys` on the new Linode.

   > **Why this is required (not optional):** after step `20-ssh.sh` disables
   > password authentication, root SSH login falls back to key-only
   > (`PermitRootLogin prohibit-password`). If you did not add a key at
   > creation, disabling password auth closes root SSH entirely and the Linode
   > **LISH console** becomes the only recovery path. Adding the key now
   > preserves the emergency backstop.

7. Click **Create Linode** and wait for it to reach _Running_ status. Note the
   **public IPv4 address** — you will need it throughout this runbook.

---

## 1. First login & copy the scripts

SSH in as root to verify the box is reachable:

```bash
ssh root@<public-ip>
```

From your **workstation** (not from inside the SSH session), copy the
provisioning scripts to the box:

```bash
scp -r infra/provision root@<public-ip>:/root/provision
```

> **Why `scp` and not `git clone`?** The repository is private and the root
> user has no Git credentials on a fresh box. `scp` needs nothing beyond the
> SSH key you already have in your agent.

---

## 2. Run provisioning

Back on the server (or in your SSH session), export both required inputs and
run the orchestrator:

```bash
cd /root/provision
export DEPLOY_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)"
export DB_PASSWORD='<strong-generated-password>'
sudo --preserve-env=DEPLOY_PUBKEY,DB_PASSWORD ./provision.sh
```

> **Why `--preserve-env`?** `sudo` resets the environment by default (`env_reset`
> in `/etc/sudoers`). Passing `--preserve-env=DEPLOY_PUBKEY,DB_PASSWORD`
> ensures those variables survive the privilege escalation. `00-preflight.sh`
> validates both are non-empty before any mutation, so a forgotten variable
> surfaces immediately as a loud `die` — not a half-provisioned box.

The orchestrator runs `00-preflight` → `10-base`, then **pauses at the
SSH-lockout gate** (see below), then continues `20-ssh` → `80-postgres`.

---

## 🚨 SSH-lockout gate

**Before you type `yes` at the gate prompt, you must:**

1. **Open a new terminal** on your workstation (do not close the current SSH
   session).
2. In that new terminal, run:
   ```bash
   ssh deploy@<public-ip>
   ```
3. Confirm the login succeeds and you have a shell as `deploy`.

**Only then** return to the running `provision.sh` and type `yes`.

If you type `yes` without verifying key login, and `20-ssh.sh` disables
password authentication while your key is not working, **you will be locked
out of SSH entirely.** Recovery is via the **Linode LISH console** (Linode
dashboard → your Linode → **LISH Console**) — it is always available
regardless of SSH state.

---

## Step 10 — OS baseline & deploy user

Script: `infra/provision/10-base.sh`

### What it does

1. Sets the system timezone to **UTC**.
2. Runs `apt-get update && apt-get full-upgrade` (all available security and
   package updates applied before anything else is configured).
3. Installs base packages: `openssh-server ufw fail2ban unattended-upgrades
ca-certificates curl gnupg acl htop`. `openssh-server` is installed
   explicitly (not assumed) so the `OpenSSH` ufw app profile is guaranteed
   present when `30-firewall.sh` runs.
4. Creates the **`deploy`** non-root user (`--disabled-password`) if it does
   not already exist (idempotent: skipped on re-run). Adds it to the `sudo`
   group.
5. Writes and **validates** a NOPASSWD sudoers drop-in
   `/etc/sudoers.d/90-deploy` via `printf`, `chmod 440`, and `visudo -cf`. If
   `visudo` rejects the rule, the drop-in is removed and the script dies loudly
   — it never leaves an invalid sudoers file on disk.
6. Installs the deploy user's `authorized_keys` from `$DEPLOY_PUBKEY`
   (idempotent via `ensure_line`: re-running never duplicates the key line).
   Sets `.ssh` to `700` and `authorized_keys` to `600`.
7. Creates `/etc/balikha` (`root:root`, mode `700`) — reserved for 4B secrets.
   **4A places no secrets here.**

### Required input

`DEPLOY_PUBKEY` must be set to the **public** key (the contents of
`~/.ssh/id_ed25519.pub`), not the private key. The script dies immediately if
this variable is absent or empty — it will never create a passwordless,
keyless sudo user (that would be an open backdoor).

```bash
export DEPLOY_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)"
```

Override the username via `DEPLOY_USER` (default: `deploy`).

### NOPASSWD posture

Because the `deploy` user is created with `--disabled-password`, password-based
`sudo` is unusable. The validated NOPASSWD drop-in makes `sudo` actually work.
The trade-off: **the SSH private key becomes the sole gate to root**. This is an
accepted posture for a single-operator box — it raises the stakes on the
key-only login, fail2ban, and password-auth-off hardening applied in later
steps.

### `/etc/balikha` — reserved for 4B

The directory `/etc/balikha` is created root-owned, mode `700`. No secrets are
placed here by 4A. In 4B, the deployment step will write
`/etc/balikha/production.env` (chmod 600) containing the runtime env vars from
`env.ts` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `S3_*`, `EMAIL_*`, etc.).

---

## Step 20 — SSH hardening

Script: `infra/provision/20-ssh.sh`

> **🚨 LOCKOUT REMINDER — do not run this script until you have confirmed
> key-based login in a separate session.**
>
> **Before running `20-ssh.sh` (or allowing `provision.sh` to proceed past the
> SSH-lockout gate), open a new terminal and run `ssh deploy@<public-ip>`.
> Confirm you have a working shell as `deploy`. Only then continue.** If you
> disable password authentication before your key is working, you will be locked
> out of SSH. Recovery is via the **Linode LISH console** (Linode dashboard →
> your Linode → **LISH Console**) — it is always available regardless of SSH
> state.

### What it does

1. Writes `/etc/ssh/sshd_config.d/10-balikha-hardening.conf` — a drop-in that
   overrides the stock `sshd_config` with hardened settings:
   - `PasswordAuthentication no` — key-only login; password auth disabled.
   - `KbdInteractiveAuthentication no` — disables keyboard-interactive
     (PAM-based) password prompts as a belt-and-suspenders guard.
   - `PubkeyAuthentication yes` — explicit; never rely on a default.
   - `PermitRootLogin prohibit-password` — root SSH via key retained as an
     emergency backstop; password root login off.
   - `PermitEmptyPasswords no` — no empty-password accounts allowed.
   - `AllowUsers ${DEPLOY_USER} root` — only the deploy user and root may log
     in via SSH; all other system accounts are blocked at the sshd level.
   - `X11Forwarding no` — no X forwarding on a headless server.
   - `MaxAuthTries 3` — limits brute-force attempts per connection.
   - `LoginGraceTime 30` — unauthenticated connections time out after 30 s.
2. Sets the drop-in to `644`.
3. Runs `sshd -t` to validate the full effective config. If validation fails,
   the script **dies without reloading** — the existing sshd keeps running with
   its current (safe) config.
4. Reloads sshd: `systemctl reload ssh` (Ubuntu 24.04 socket-based service),
   falling back to `systemctl reload sshd`. Existing sessions are not
   interrupted; new connections immediately use the hardened config.
5. Emits a `warn` reminding you to confirm a new key-based session works before
   closing the current one, and that LISH is the recovery path.

The drop-in approach means re-running the script is idempotent — it rewrites
the same file with the same content and reloads; no duplication possible.

### Verification

After `20-ssh.sh` completes (or after `provision.sh` passes this step):

```bash
# Confirm the effective sshd config has password auth off:
sudo sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin|pubkeyauthentication)'
# Expected output (order may vary):
#   passwordauthentication no
#   pubkeyauthentication yes
#   permitrootlogin prohibit-password

# Confirm a key-based login still works (from your workstation):
ssh deploy@<public-ip>

# Confirm a password-based login is rejected:
ssh -o PreferredAuthentications=password deploy@<public-ip>
# Expected: "Permission denied (publickey)." -- NOT a password prompt.
```

---

## Step 30 — ufw firewall (AC2)

Script: `infra/provision/30-firewall.sh`

### What it does

1. Sets the ufw default policy: **deny all inbound, allow all outbound**.
2. Allows **`OpenSSH`** (port 22) — **before** enabling the firewall, so the
   running session cannot be dropped by the enable command.
3. Allows **`80/tcp`** (HTTP) and **`443/tcp`** (HTTPS).
4. Runs `ufw --force enable` — the `--force` flag skips the interactive
   confirmation prompt (safe because SSH is already allowed).
5. Prints `ufw status verbose` so the applied rules are visible in the
   provisioning log.

> **Port 5432 is intentionally NOT opened.** PostgreSQL is bound to
> `localhost` only (`listen_addresses = 'localhost'` in `80-postgres.sh`).
> Not opening 5432 in the firewall is a second layer of defense — even if the
> Postgres bind ever regressed to `0.0.0.0`, the firewall would still block
> external connections. **AC3** is therefore defense-in-depth, not a single
> control.

### Verification (on-server)

```bash
sudo ufw status verbose
# Expected:
#   Status: active
#   Default: deny (incoming), allow (outgoing), ...
#   OpenSSH    ALLOW IN   Anywhere
#   80/tcp     ALLOW IN   Anywhere
#   443/tcp    ALLOW IN   Anywhere
# 5432 must NOT appear.
```

Re-running the script is a no-op: `ufw allow` silently skips rules that
already exist; `ufw --force enable` on an already-enabled firewall is safe.

---

## Step 40 — fail2ban sshd jail

Script: `infra/provision/40-fail2ban.sh`

### What it does

1. Writes `/etc/fail2ban/jail.local` with a `[DEFAULT]` stanza
   (`bantime = 1h`, `findtime = 10m`, `maxretry = 5`, `backend = systemd`)
   and an `[sshd]` stanza (`enabled = true`). Writing to `jail.local` (not
   editing `jail.conf`) means package upgrades never clobber the
   configuration.
2. `systemctl enable fail2ban` — ensures the jail restarts on reboot.
3. `systemctl restart fail2ban` — picks up the new `jail.local` immediately.
4. `fail2ban-client status sshd` — confirms the jail is loaded; emits a
   `warn` (not a `die`) if it is not yet reporting (the service may take a
   few seconds to start the first time).

### Verification (on-server)

```bash
sudo fail2ban-client status sshd
# Expected output includes:
#   Jail:                   sshd
#   Currently failed:       0
#   Total failed:           0
#   Currently banned:       0
#   Total banned:           0
```

### Active ban test (load-testing the jail, not just its presence)

A loaded jail is not the same as a banning jail. Verify fail2ban actually
bans after repeated failures:

1. **From a second host** (not your current SSH session — you cannot lock
   yourself out of a session already open):

   ```bash
   # Attempt SSH with a bad key 6 times (maxretry = 5).
   for i in $(seq 1 6); do
     ssh -o PreferredAuthentications=publickey \
         -o IdentityFile=/dev/null \
         deploy@<public-ip> true 2>/dev/null || true
   done
   ```

2. **Back on the server**, check that the ban was applied:

   ```bash
   sudo fail2ban-client status sshd
   # "Total banned" and/or "Currently banned" should now be non-zero.
   ```

3. To unban a test IP manually:

   ```bash
   sudo fail2ban-client set sshd unbanip <ip-of-second-host>
   ```

Re-running `40-fail2ban.sh` is idempotent: `jail.local` is rewritten
identically; `systemctl enable` is a no-op if already enabled; `restart`
picks up the unchanged config cleanly.

---

## Step 50 — unattended security updates

Script: `infra/provision/50-autoupdates.sh`

### What it does

1. Writes `/etc/apt/apt.conf.d/20auto-upgrades` — enables daily package-list
   refresh (`Update-Package-Lists "1"`) and daily unattended upgrade runs
   (`Unattended-Upgrade "1"`).
2. Writes `/etc/apt/apt.conf.d/52balikha-unattended` — enables automatic
   reboot after a security update (`Automatic-Reboot "true"`) with a reboot
   window of **03:30 UTC** (`Automatic-Reboot-Time "03:30"`).
3. `systemctl enable unattended-upgrades` — ensures the unit starts on boot.

> **Why `enable` only, not `restart`?** `unattended-upgrades.service` is a
> oneshot/shutdown-triggered unit. Calling `restart` on a oneshot unit can
> exit non-zero and abort the provisioning run under `set -e`. Scheduling is
> handled by `apt-daily.timer` and `apt-daily-upgrade.timer` — those are
> already active on Ubuntu 24.04; there is nothing to restart here.

### Auto-reboot window

Security updates that require a reboot (kernel, libc, openssh) will trigger
an automatic reboot at **03:30 UTC** (11:30 Philippine Standard Time). At
pre-launch traffic levels this is acceptable. To **disable** the auto-reboot
without removing automatic updates:

```bash
sudo sed -i 's|^Unattended-Upgrade::Automatic-Reboot "true";|Unattended-Upgrade::Automatic-Reboot "false";|' \
  /etc/apt/apt.conf.d/52balikha-unattended
```

Or edit the file directly and set `Automatic-Reboot "false"`.

To verify that security updates are actually selecting the right origin (not
just that the timer is on):

```bash
sudo unattended-upgrade --dry-run --debug 2>&1 | tail -n 30
# Should list the Ubuntu security origin as an allowed source.
```

---

## Step 60 — 2 GB swap file (AC4)

Script: `infra/provision/60-swap.sh`

### What it does

1. **Idempotency guard:** checks `swapon --show` — if `/swapfile` is already
   listed, the creation block is skipped entirely.
2. Creates `/swapfile` (2 GB) with `fallocate -l 2G`. If `fallocate` fails
   (some Linode kernels or filesystem types reject it), falls back to
   `dd if=/dev/zero of=/swapfile bs=1M count=2048` — and removes any partial
   file `fallocate` may have left before retrying.
3. Sets permissions to `600` (root-only read/write — required for a valid
   swap file), then `mkswap` + `swapon`.
4. Adds `/swapfile none swap sw 0 0` to `/etc/fstab` via `ensure_line`
   (idempotent: re-running never duplicates the fstab entry).
5. Writes `/etc/sysctl.d/99-balikha-swap.conf`:
   - `vm.swappiness = 10` — the kernel uses RAM first; swap is a last resort,
     not an extension of RAM.
   - `vm.vfs_cache_pressure = 50` — slightly favours keeping directory/inode
     cache in RAM (useful for a Next.js server with many small files).
6. `sysctl --system` — applies the new settings immediately without a reboot.
7. Prints `swapon --show` so the active swap is visible in the log.

### Sizing rationale

The box has 1 GB RAM. Rough memory budget:

| Component                   | Estimate        |
| --------------------------- | --------------- |
| PostgreSQL 16 (1 GB tuning) | 150–250 MB      |
| `next start` idle           | 150–300 MB      |
| OS, journald, fail2ban      | 150–250 MB      |
| **Total at idle**           | **~450–800 MB** |

Under load (SSR bursts, migrations), resident set can spike past 1 GB. The
2 GB swap file is insurance, not a substitute for RAM. The **objective
resize trigger** is recurring OOM-killer entries in the journal:

```bash
journalctl -k | grep -i oom
```

If OOM kills appear under normal traffic, resize the Linode to 2 GB from the
dashboard (see the "Resizing up" section below).

### Verification (on-server)

```bash
swapon --show
# Expected: /swapfile   file   2G   0B   -2
grep swapfile /etc/fstab
# Expected: /swapfile none swap sw 0 0   (appears exactly once)
sysctl vm.swappiness vm.vfs_cache_pressure
# Expected: vm.swappiness = 10 / vm.vfs_cache_pressure = 50
```

**AC4** satisfied once `/swapfile` appears in `swapon --show`.

---

## Step 70 — NTP time synchronisation

Script: `infra/provision/70-timesync.sh`

### What it does

1. `timedatectl set-ntp true` — enables NTP synchronisation via the system's
   configured NTP client (which is `systemd-timesyncd` on Ubuntu 24.04).
2. `systemctl enable --now systemd-timesyncd` — enables the timesyncd unit at
   boot and starts it immediately if not already running.
3. Prints `timedatectl show-timesync` and `timedatectl status` so the NTP
   state is visible in the provisioning log.

### Verification (on-server)

```bash
timedatectl status
# Expected lines (exact wording may vary by Ubuntu release):
#   NTP service: active
#   System clock synchronized: yes   (may show "no" for a few seconds on a
#                                     fresh box -- wait and re-check)
timedatectl show-timesync --property=NTPSynchronized
# Expected: NTPSynchronized=yes
```

> **Note:** `System clock synchronized: yes` can legitimately show `no` for
> a few seconds immediately after first enable, while timesyncd completes its
> first poll. `99-verify.sh` asserts that the NTP _service_ is active (a
> deterministic state), not that the clock is already synchronised (which
> would be a race on a freshly booted box).

---

## Verification

<!-- Filled by Task 6.1 -->

---

## Resizing up when traction appears

<!-- Filled by Task 6.2 -->

---

## Secrets & handoff to 4B

<!-- Filled by Task 6.2 -->

---

## Rollback

<!-- Filled by Task 6.2 -->
