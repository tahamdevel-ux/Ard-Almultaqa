FROM postgres:16
RUN apt-get update && apt-get install -y --no-install-recommends cron openssl rclone && rm -rf /var/lib/apt/lists/*
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh \
 && echo "30 2 * * * root /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/cron.d/backup
CMD ["sh", "-c", "printenv | grep -E '^(PG|BACKUP|RCLONE)' | sed 's/^/export /' > /etc/backup.env && cron -f"]
