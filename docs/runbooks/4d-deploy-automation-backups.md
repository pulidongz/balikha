# 4D — Deploy Automation & Database Backups Runbook

**Scope:** Configure push-to-`main` continuous deployment via GitHub Actions, set
up nightly `pg_dump` → private Cloudflare R2 backups (7 daily + 4 weekly), and
verify a tested restore. After completing this runbook, every push to `main`
deploys automatically, the database is backed up nightly to a private R2 bucket,
and a restore has been performed into a scratch database.

**4D↔4E boundary:** This runbook covers deploy automation and database backups
only. Cloudflare proxy / WAF is 4E — do not change DNS proxy settings during
this runbook.

---

## Step 1 — Prerequisites and initial box setup

Before starting, confirm:

- [ ] The box is **provisioned and the app deployed** per
      `docs/runbooks/4a-host-provisioning.md` and
      `docs/runbooks/4b-production-deployment.md`.
- [ ] `gh` CLI authenticated (`gh auth status`).
- [ ] You have access to the Cloudflare dashboard for the `balikha` account.

### Create the private `balikha-backups` R2 bucket

In the Cloudflare dashboard → R2 → Create bucket:

- **Name:** `balikha-backups`
- **Do NOT add a public custom domain** — this bucket must never be
  internet-readable. (Unlike `balikha-prod`, which is public via
  `images.balikha.art`, backups contain database dumps with user PII.)

### Create an R2 API token scoped to the backup bucket

In the Cloudflare dashboard → R2 → Manage API Tokens:

- **Permissions:** Object Read & Write
- **Bucket:** scoped to `balikha-backups` only (not `balikha-prod`)
- Note the **Access Key ID** and **Secret Access Key**.

### Write `/etc/balikha/backup.env` on the box

On the box (as root):

```bash
# Write the template directly, then open it to fill the secrets (keeps them out
# of shell history). NOTE: do NOT `cp` from /opt/balikha/current — the deploy
# tarball excludes ./.env*, so `.env.backup.example` is not in the release tree.
# This heredoc reproduces that template (see .env.backup.example in the repo):
sudo tee /etc/balikha/backup.env >/dev/null <<'EOF'
BACKUP_S3_ENDPOINT=https://30d8e334acd6a66be73c7d0442f5a5c9.r2.cloudflarestorage.com
BACKUP_S3_BUCKET=balikha-backups
AWS_ACCESS_KEY_ID=<r2 backups access key id>
AWS_SECRET_ACCESS_KEY=<r2 backups secret access key>
AWS_DEFAULT_REGION=auto
EOF
sudo nano /etc/balikha/backup.env
```

Fill in every `<...>` placeholder with the R2 token values from above:

| Variable                | Value                                         |
| ----------------------- | --------------------------------------------- |
| `BACKUP_S3_ENDPOINT`    | Already set in template — the R2 endpoint URL |
| `BACKUP_S3_BUCKET`      | `balikha-backups`                             |
| `AWS_ACCESS_KEY_ID`     | From the R2 API token created above           |
| `AWS_SECRET_ACCESS_KEY` | From the same token                           |
| `AWS_DEFAULT_REGION`    | `auto` (already set in template)              |

After filling in the file:

```bash
sudo chmod 600 /etc/balikha/backup.env
sudo chown root:root /etc/balikha/backup.env
```

---

## Step 2 — Set up CI deploy access and GitHub Environment

### Generate a dedicated CI deploy keypair

On your workstation (not the box):

```bash
ssh-keygen -t ed25519 -C "balikha-ci-deploy" -f ./balikha-ci-deploy
```

This creates `balikha-ci-deploy` (private) and `balikha-ci-deploy.pub` (public).

### Append the public key to the deploy user's authorized_keys on the box

```bash
ssh deploy@<ip> 'cat >> ~/.ssh/authorized_keys' < balikha-ci-deploy.pub
```

Verify the key was appended:

```bash
ssh deploy@<ip> 'tail -1 ~/.ssh/authorized_keys'
```

### Create the GitHub `production` Environment and set secrets

In the GitHub repository → Settings → Environments → New environment: name it
`production`. **Strongly recommended: add a required reviewer** so a person must
approve each production deploy. The deploy job is also gated to `main` only
(`if: github.ref == 'refs/heads/main'`, review HIGH), so a `workflow_dispatch`
from a feature branch builds but will **not** deploy — but the required-reviewer
rule is the defence-in-depth that makes even a malicious `main` push reviewable
before it runs `deploy.sh` as root. Treat the reviewer gate as non-optional in
practice.

Set the three secrets **on the environment** (not repo-wide) — env-scoped secrets
are only available to jobs that declare `environment: production`, limiting
exposure of the root-capable deploy key:

```bash
# Private key — the deploy job writes this to ~/.ssh/id_ed25519 on the runner
gh secret set DEPLOY_SSH_KEY --env production < balikha-ci-deploy

# deploy@<ip> — the address deploy.sh SSHes to
gh secret set DEPLOY_HOST --env production --body 'deploy@<ip>'

# Known-hosts fingerprint — prevents MITM on first connect
gh secret set DEPLOY_KNOWN_HOSTS --env production --body "$(ssh-keyscan <ip>)"
```

> **Security posture:** `DEPLOY_SSH_KEY` is a NOPASSWD-sudo key (= root reach
> on the box). It lives only in the GitHub Environment secrets. To rotate:
> remove the old line from `~/.ssh/authorized_keys` on the box and re-run
> `gh secret set DEPLOY_SSH_KEY --env production < new-key`.

After setting the secrets, delete the private key file from your workstation:

```bash
rm balikha-ci-deploy balikha-ci-deploy.pub
```

---

## Step 3 — Provision the backup dependencies on the box

Re-run the app-runtime provisioning script (it is idempotent). This installs
`postgresql-client-16` and `awscli` if absent, copies the new
`balikha-backup.service` and `balikha-backup.timer` systemd units, and enables
the timer:

```bash
ssh root@<public-ip>
sudo /root/balikha-infra/provision/90-app-runtime.sh
```

> If the `infra/` tree on the box is stale, re-ship it first:
>
> ```bash
> scp -r infra root@<public-ip>:/root/balikha-infra
> ```

Then run the verify script to confirm all checks pass:

```bash
sudo /root/balikha-infra/provision/99-verify.sh
```

Expected output: every check prints `PASS:` and the script exits with
`ALL CHECKS PASSED.` The new checks added in 4D are:

- `PASS: pg_dump present (16.x)`
- `PASS: awscli present`
- `PASS: balikha-backup.timer enabled`

---

## Step 4 — How auto-deploy works

Every push or merge to `main` triggers the `Release & deploy` GitHub Actions
workflow (`release.yml`). The workflow:

1. **`build` job:** builds the Next.js app, packages a deploy artifact.
2. **`deploy` job** (needs `build`, `environment: production`): downloads the
   artifact, loads `DEPLOY_SSH_KEY` → `~/.ssh/id_ed25519`, then runs
   `infra/production/deploy.sh` against the box.

Each deploy takes a **pre-migration backup** (via `balikha-backup.service`)
**before** the `current` symlink is flipped and migrations run — so every
unattended migration has a fresh restore point, and a backup failure leaves
`current` on the old, good release.

To trigger a manual re-deploy without pushing:

```bash
gh workflow run release.yml
```

> **⚠️ (Issue 1) Ordering: complete steps 1–3 above (bucket, token,
> `backup.env`, re-run `90-app-runtime.sh`) and confirm `99-verify.sh` is
> green BEFORE merging the 4D PR to `main`.** Merging arms the push trigger,
> and the first auto-deploy immediately runs the pre-migration backup. The
> `deploy.sh` guard (`systemctl cat balikha-backup.service`) will hard-fail the
> deploy if the box is not ready, stranding the CI run. Note the deploy job is
> `main`-gated, so a `workflow_dispatch` from the feature branch only **builds**
> (the deploy job is skipped) — it confirms the build but not SSH/deploy. To
> validate the deploy path before the trigger is live, run the **manual** path
> once from your workstation (the 4B flow: `gh run download` the artifact →
> `infra/production/deploy.sh deploy@<ip> <artifact>`); that exercises the same
> SSH/sudo/backup/migrate sequence CI will use.

> **(Issue 9) Rapid successive merges:** The `concurrency` group
> (`deploy-production`, `cancel-in-progress: false`) serialises deploys but
> does **not** cancel queued runs. Rapid merges deploy in commit order; the last
> one wins. This is intentional — a mid-flight deploy is never cancelled.

---

## Step 5 — Verify AC1 (push deploys automatically)

Make a trivial commit to `main` and watch the workflow:

```bash
gh run watch
```

Confirm the `deploy` job succeeds. Then check the app is healthy:

```bash
curl -fsS https://balikha.art/api/health
# Expected: {"status":"ok"}
```

---

## Step 6 — Verify AC2 (scheduled backup lands in R2)

### One-time awscli smoke test

`90-app-runtime.sh` installs **awscli v2** via the official installer (Ubuntu
24.04 has no `apt` `awscli` candidate). Confirm it talks to R2 before relying on
it (a quick round-trip — upload, list, delete):

```bash
ssh deploy@<ip>
sudo bash -c 'set -a; source /etc/balikha/backup.env; set +a; \
  echo smoke | aws s3 cp - s3://"$BACKUP_S3_BUCKET"/smoke.txt --endpoint-url "$BACKUP_S3_ENDPOINT" \
  && aws s3 ls s3://"$BACKUP_S3_BUCKET"/ --endpoint-url "$BACKUP_S3_ENDPOINT" \
  && aws s3 rm s3://"$BACKUP_S3_BUCKET"/smoke.txt --endpoint-url "$BACKUP_S3_ENDPOINT"'
```

Expected: the upload, listing, and removal all succeed without errors. (If you
ever hit awscli/R2 compatibility issues, `rclone` is the fallback.)

### Run a real backup

```bash
ssh deploy@<ip> 'sudo systemctl start balikha-backup.service && \
  journalctl -u balikha-backup.service -n 20 --no-pager'
```

Expected journal output: lines showing the dump, validation, upload, and
`✓ backup complete: balikha-<ts>.dump`.

Confirm the backup object exists in R2 (R2 creds live only in root-owned
`/etc/balikha/backup.env`, so source it — a bare `aws s3 ls` has no credentials
and fails with an auth error):

```bash
ssh deploy@<ip> 'sudo bash -c "set -a; . /etc/balikha/backup.env; set +a; \
  aws s3 ls s3://\$BACKUP_S3_BUCKET/daily/ --endpoint-url \$BACKUP_S3_ENDPOINT"'
```

Check the nightly timer is scheduled:

```bash
ssh deploy@<ip> 'systemctl list-timers balikha-backup.timer'
# Expected: timer listed, next trigger shown (~02:00 UTC).
```

---

## Step 7 — Verify AC3 (restore into scratch DB)

SSH into the box and run `restore.sh` against a scratch database:

```bash
ssh deploy@<ip>
sudo bash -c 'set -a; source /etc/balikha/backup.env; set +a; \
  /opt/balikha/current/infra/production/restore.sh \
  daily/<dump-filename-from-step-6> \
  balikha_restore_test'
```

Verify the restore succeeded — tables should be present:

```bash
sudo -u postgres psql -d balikha_restore_test -c "\dt"
```

Expected: the schema tables are listed.

**Drop the scratch DB immediately after verifying** — it is a real PII copy
on the box:

```bash
sudo -u postgres dropdb balikha_restore_test
```

This is the AC3 evidence: a restore from a real backup has been performed
successfully into a non-production database.

---

## Step 8 — Backup retention

`backup.sh` prunes automatically on every run, by prefix:

- **Daily** (`daily/`): the nightly timer keeps the **newest 7** dumps.
- **Weekly** (`weekly/`): on Sundays (UTC) the nightly run also copies to
  `weekly/`; keeps the **newest 4**.
- **Pre-deploy** (`predeploy/`): each deploy's pre-migration snapshot
  (`backup.sh predeploy`) writes here and keeps the **newest 10** — a SEPARATE
  pool, so deploy-heavy days never evict the nightly `daily/` history (review
  HIGH/MEDIUM).

No manual retention management is needed. To inspect what is retained (source
the creds — a bare `aws s3 ls` has none):

```bash
ssh deploy@<ip> 'sudo bash -c "set -a; . /etc/balikha/backup.env; set +a; \
  aws s3 ls s3://\$BACKUP_S3_BUCKET/daily/     --endpoint-url \$BACKUP_S3_ENDPOINT; \
  aws s3 ls s3://\$BACKUP_S3_BUCKET/weekly/    --endpoint-url \$BACKUP_S3_ENDPOINT; \
  aws s3 ls s3://\$BACKUP_S3_BUCKET/predeploy/ --endpoint-url \$BACKUP_S3_ENDPOINT"'
```

---

## Step 9 — Rollback and recovery

**Code-only rollback** (no schema change) is unchanged from the 4B runbook —
repoint the `current` symlink and restart `balikha.service`.

**After a bad migration:** because every deploy takes a pre-migration backup,
there is always a restore point. Use `restore.sh` to inspect the pre-migration
state in a scratch DB:

```bash
sudo bash -c 'set -a; source /etc/balikha/backup.env; set +a; \
  /opt/balikha/current/infra/production/restore.sh \
  daily/<pre-migration-dump> \
  balikha_restore_test'
```

Inspect the data, determine the recovery path. A **full production restore**
(replacing the live `balikha` DB) is a deliberate, manual operation — `restore.sh`
hard-refuses to target the live `balikha` database.

> **Note:** Drizzle migrations are forward-only. A code rollback after a schema
> migration leaves the DB schema ahead of the code. Plan accordingly before
> rolling back code after a migration.

---

## Step 10 — Security note (PII in backups)

Database dumps contain user PII (accounts, orders). The following controls are
in place:

- Backups go to the **private** `balikha-backups` R2 bucket — no public
  endpoint, no custom domain.
- R2 provides at-rest encryption for all stored objects.
- The `restore.sh` guard hard-refuses to restore over the live `balikha` DB.

**Residual risk:** the R2 API token stored in `/etc/balikha/backup.env` can
read the entire backup history. A token compromise means full PII-history
exfiltration, with no second factor. Client-side gpg encryption of dumps before
upload is the documented next step as the user base grows — it is deliberately
deferred for now.

Always `sudo -u postgres dropdb balikha_restore_test` after the AC3 restore
test (step 7 above) — the scratch DB is a real PII copy on the box.

---

## Step 11 — Scheduled jobs: weekly digest & failure alerts

Two oneshot jobs run on systemd timers besides the nightly backup:
`balikha-weekly-digest.service` (Mondays 08:00 PHT) and
`balikha-orders-tick.service` (hourly). All three oneshots
(`...-weekly-digest`, `...-orders-tick`, `...-backup`) declare
`OnFailure=balikha-job-failure-alert@%n.service`, a handler that emails
`ADMIN_EMAIL` the failed unit name + the last 30 journal lines (via the
Resend SDK; it reads config from `production.env` directly and logs to the
journal).

> The OnFailure wiring only reaches the box when `90-app-runtime.sh` is
> re-run (`cp *.service` + `daemon-reload`) — a normal push-to-main deploy
> does NOT re-run it. After any change to these units, re-run the provisioning
> script and confirm `99-verify.sh` is green (it asserts both the digest timer
> and the OnFailure wiring).

### Verify the digest timer + alert wiring

```bash
ssh deploy@<ip> 'systemctl list-timers balikha-weekly-digest.timer'
# Expected: timer listed, next trigger ~Monday 00:00 UTC (08:00 PHT).
ssh deploy@<ip> 'systemctl show -p OnFailure balikha-weekly-digest.service'
# Expected: OnFailure=balikha-job-failure-alert@...  (also asserted by 99-verify.sh)
```

### Run the digest manually

```bash
ssh deploy@<ip> 'sudo systemctl start balikha-weekly-digest.service'   # real send
npm run digest:weekly -- --dry-run                                     # local, no send
```

### Read the logs

```bash
ssh deploy@<ip> 'journalctl -u balikha-weekly-digest.service -n 50 --no-pager'
# The final line reports: sent / failed / skippedEmpty / skippedOptOut.
```

### Verify & debug failure alerting

```bash
# Fire the alert handler directly against a known unit:
ssh deploy@<ip> 'sudo systemctl start balikha-job-failure-alert@balikha-weekly-digest.service'
ssh deploy@<ip> "journalctl -u 'balikha-job-failure-alert@*' -n 20 --no-pager"
# Expected: an email at ADMIN_EMAIL and a 'job-failure-alert: sent for ...' line.
```

If no email arrives, check the handler's own status — it is the silent-failure
detector, so its own failure is observable only here:

```bash
ssh deploy@<ip> "systemctl status 'balikha-job-failure-alert@*' --no-pager"
# A non-zero handler exit means a required mail var (ADMIN_EMAIL / EMAIL_FROM /
# RESEND_API_KEY) is unset, or Resend rejected the send — the journal line says which.
```

---

## Step 12 — Roadmap note

On successful completion of all 3 ACs, mark **4D** as done in
`docs/plans/balikha-roadmap.md`:

- Change `### [ ] 4D` → `### [x] 4D`
- Set `**Status:**` to `done`

Then commit the update.
