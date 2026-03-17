# 🔧 IT Support Management System — Mwamiri/itsupport

## ⚡ One-Command Deploy

```bash
git clone https://github.com/Mwamiri/itsupport.git
cd itsupport

# Local (testing)
bash deploy.sh

# Production with domain + SSL
bash deploy.sh yourdomain.com
```

Script auto-installs Docker, builds everything, migrates DB, seeds data, starts all services.

## Default Login
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@itsupport.local | password |
| Technician | tech@itsupport.local | password |
| Client | client@itsupport.local | password |

## Commands
```bash
make status    # Check containers
make logs      # Live logs
make backup    # Backup DB
make restart   # Restart all
make down      # Stop all
make rebuild   # Rebuild + restart
```

## Update
```bash
git pull && make rebuild
```
