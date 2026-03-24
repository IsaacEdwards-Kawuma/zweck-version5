# Incident Response Runbook

## Purpose
This runbook defines how to triage and resolve production incidents for ZweckOS.

## Severity levels
- Sev 1: Full outage, data loss risk, or authentication failure for all users.
- Sev 2: Core workflows degraded (posting, reports, project updates) for many users.
- Sev 3: Partial degradation or non-critical feature failures.

## Immediate triage checklist
1. Confirm impact scope (single user, tenant-wide, global).
2. Check API health endpoint: `/api/health`.
3. Check error monitoring (Sentry issues and spike alerts).
4. Check latest deploy and rollback candidate.
5. Check DB connectivity and migration state.

## Response procedure
1. Declare incident in team channel with severity and owner.
2. Stabilize service first (rollback, disable non-critical paths, or hotfix).
3. Capture timeline:
   - first alert time
   - first user report
   - mitigation applied
   - full recovery time
4. Validate key smoke paths:
   - login
   - post transaction
   - settings
   - projects
   - reports

## Recovery verification
- Error rate returns to baseline.
- No new critical Sentry issues for 15 minutes.
- Smoke checks pass.
- Audit logs and data integrity checks pass.

## Post-incident
1. Write postmortem with root cause and corrective actions.
2. Add regression tests for the root cause.
3. Update runbook and readiness checklist if gaps were discovered.
