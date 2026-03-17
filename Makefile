# ══════════════════════════════════════════════════════════════════════════════
# IT Support System — Makefile
# Run: make <command>
# ══════════════════════════════════════════════════════════════════════════════

.PHONY: help up down restart logs shell-backend shell-db status clean deploy

help:
	@echo ""
	@echo "IT Support System — Commands"
	@echo "────────────────────────────────────────"
	@echo "  make deploy DOMAIN=yourdomain.com  Full auto-deploy with SSL"
	@echo "  make up                            Start all services"
	@echo "  make down                          Stop all services"
	@echo "  make restart                       Restart all services"
	@echo "  make logs                          View live logs (Ctrl+C to stop)"
	@echo "  make logs-api                      API logs only"
	@echo "  make logs-db                       Database logs only"
	@echo "  make status                        Show container status"
	@echo "  make shell-backend                 Open backend shell"
	@echo "  make shell-db                      Open database shell"
	@echo "  make backup                        Backup database"
	@echo "  make restore FILE=backup.sql       Restore database"
	@echo "  make clean                         Remove all containers + volumes"
	@echo ""

# ── DEPLOY ────────────────────────────────────────────────────────────────────
deploy:
	@bash deploy.sh $(DOMAIN)

# ── START / STOP ──────────────────────────────────────────────────────────────
up:
	docker compose up -d
	@echo "✅ All services started — http://localhost"

down:
	docker compose down

restart:
	docker compose restart

rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d

# ── LOGS ──────────────────────────────────────────────────────────────────────
logs:
	docker compose logs -f

logs-api:
	docker compose logs -f backend

logs-db:
	docker compose logs -f db

logs-nginx:
	docker compose logs -f nginx

# ── STATUS ────────────────────────────────────────────────────────────────────
status:
	@echo ""
	@echo "Container Status:"
	@docker compose ps
	@echo ""
	@echo "Health Check:"
	@curl -sf http://localhost/health && echo " ✅ API is healthy" || echo " ❌ API not reachable"

# ── SHELLS ────────────────────────────────────────────────────────────────────
shell-backend:
	docker compose exec backend sh

shell-db:
	docker compose exec db psql -U itsupport -d itsupport

shell-nginx:
	docker compose exec nginx sh

# ── DATABASE ──────────────────────────────────────────────────────────────────
backup:
	@mkdir -p backups
	@FILENAME=backups/itsupport-$(shell date +%Y%m%d-%H%M%S).sql; \
	docker compose exec -T db pg_dump -U itsupport itsupport > $$FILENAME; \
	echo "✅ Backup saved: $$FILENAME"

restore:
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=backups/yourfile.sql" && exit 1)
	docker compose exec -T db psql -U itsupport -d itsupport < $(FILE)
	@echo "✅ Database restored from $(FILE)"

seed:
	docker compose exec backend node src/db/seed.js

migrate:
	docker compose exec backend node src/db/migrate.js
	docker compose exec backend node src/db/migrate_technicians.js

# ── CLEANUP ───────────────────────────────────────────────────────────────────
clean:
	@echo "⚠️  This removes ALL containers, volumes and data!"
	@read -p "Are you sure? [y/N] " confirm; \
	if [ "$$confirm" = "y" ]; then \
	  docker compose down -v --remove-orphans; \
	  echo "✅ Cleaned up"; \
	else \
	  echo "Cancelled"; \
	fi

# ── SSL ───────────────────────────────────────────────────────────────────────
ssl:
	@test -n "$(DOMAIN)" || (echo "Usage: make ssl DOMAIN=yourdomain.com EMAIL=you@email.com" && exit 1)
	@test -n "$(EMAIL)"  || (echo "Usage: make ssl DOMAIN=yourdomain.com EMAIL=you@email.com" && exit 1)
	docker compose run --rm certbot certonly \
	  --webroot -w /var/www/certbot \
	  --email $(EMAIL) --agree-tos --no-eff-email \
	  -d $(DOMAIN)
	docker compose restart nginx
	@echo "✅ SSL installed for $(DOMAIN)"
