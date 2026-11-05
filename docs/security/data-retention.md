# Data Retention & Deletion Policy

| Data | Retention | Deletion mechanism |
|---|---|---|
| Boards, comments, AI assets | While the workspace exists | User deletes the board; owner deletes the workspace (Settings), or uses Privacy & data → Delete |
| Integration credentials | Until disconnected | Deleted immediately on **Disconnect**, workspace deletion, or account deletion |
| Account data | Until account deletion | Settings → Account → Delete account (solely-owned workspaces are deleted too) |
| Sessions | 30 days, sliding | Expired sessions purged hourly; deleted on sign-out, password change or reset |
| Password-reset and invite tokens | 1 hour / 7 days | Expire automatically; an hourly job (`server/maintenance.ts`) purges expired rows |
| AI usage records | 24 months (`USAGE_RETENTION_DAYS`) | Hourly purge job |
| Audit log | 12 months (`AUDIT_RETENTION_DAYS`) | Hourly purge job |
| Database backups | [7–30 days] (as configured with the hosting provider) | Roll off automatically |
| Stripe billing records | As required by tax law | Held by Stripe |

When someone asks us to delete their data, we complete it within 30 days. Backups roll off within the backup window. See `/legal/data-deletion`.
