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
