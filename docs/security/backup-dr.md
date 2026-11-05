# Backup & Disaster Recovery

- **Database:** use the managed Postgres provider's daily backups with point-in-time recovery (enable PITR on a paid plan). Target **recovery point (RPO): 24 hours or less, or 5 minutes with PITR. Recovery time (RTO): 4 hours.**
- **Encryption key:** keep `ENCRYPTION_KEY` in the team password manager, separate from the database. Without it, restored integration credentials can't be read, and customers would need to reconnect.
- **Restore drill:** every quarter, restore the latest backup into a staging environment, boot the app against it, and sign in. Record the results.
- **Application:** the app holds no state on the server itself. Redeploy from Git, or roll back to the previous deploy in the hosting dashboard.
- **Provider outage:** if the region is down for longer than the recovery-time target, restore the latest backup in another region with the same environment variables, then point DNS at it.
