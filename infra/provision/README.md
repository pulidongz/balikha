# Balikha host provisioning (ticket #18 / roadmap 4A)

Idempotent provisioning scripts for a single Ubuntu 24.04 LTS Linode
(production-only, $5 / 1 GB). **Read the runbook before running anything:**
[`docs/runbooks/4a-host-provisioning.md`](../../docs/runbooks/4a-host-provisioning.md).

Run order (orchestrated by `provision.sh`):
`00-preflight` → `10-base` → **[confirm key login]** → `20-ssh` →
`30-firewall` → `40-fail2ban` → `50-autoupdates` → `60-swap` →
`70-timesync` → `80-postgres`. Verify with `99-verify.sh`.

Every script is safe to re-run.
