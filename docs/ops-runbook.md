# Ops runbook — kroky vyžadující ruční zásah na serveru

> Vzniklo 2026-07-12 při hromadné opravě dluhů. Tyto položky NEJDOU udělat z kódu —
> vyžadují přístup k serveru / DNS / koordinované okno s restartem. Každá sekce má
> ověřovací krok PŘED zásahem (nedělej naslepo) a rollback poznámku.
> Souvisí: `docs/dluhy.md` (FE repo) → D-SEC-GAP / D-LAUNCH-GAP / D-AUDIT.

---

## 1) Backend port jen pro proxy (styl 5)

**Stav:** `docker-compose.prod.yml` publikuje backend `"${BACKEND_PORT:-3001}:3000"` →
poslouchá na 0.0.0.0, tedy obchází reverse-proxy TLS (kdo zná IP:3001, mluví s BE http).
**Ověř nejdřív:** kde běží reverse proxy (Caddy) — pokud na TÉMŽE hostu a proxuje na
`localhost:3001`, je bezpečné omezit bind na loopback.
```bash
ss -tlnp | grep 3001          # na co je port navázán
curl -s http://SERVER_IP:3001/api/health   # z jiného stroje — pokud odpoví, je otevřený do světa
```
**Zásah (volba A — compose):** v `docker-compose.prod.yml` změnit mapping na
`"127.0.0.1:${BACKEND_PORT:-3001}:3000"` a nasadit. **Volba B — firewall:** viz sekce 5.
**Rollback:** vrátit mapping.

## 2) MongoDB auth (styl 5) — POZOR: replica set vyžaduje keyFile

**Stav:** mongod běží s `--replSet rs0 --bind_ip_all` BEZ `--auth`. Port není publikován
mimo docker síť (`ikaros-net`), riziko je laterální (kompromitovaný kontejner/host).
**Postup (koordinované okno, ~15 min výpadek):**
1. Záloha DB (sekce 6) — VŽDY před zásahem.
2. Vytvoř keyFile (auth mezi členy replsetu — nutný i pro single-node rs):
   ```bash
   openssl rand -base64 756 > /opt/ikaros/mongo-keyfile
   chmod 400 /opt/ikaros/mongo-keyfile && chown 999:999 /opt/ikaros/mongo-keyfile
   ```
3. Vytvoř uživatele (dokud auth NENÍ zapnuté):
   ```bash
   docker exec -it projekt-ikaros-mongo mongosh --eval '
     db.getSiblingDB("admin").createUser({user:"admin",pwd:"<SILNÉ HESLO 1>",roles:["root"]});
     db.getSiblingDB("ikaros").createUser({user:"ikaros",pwd:"<SILNÉ HESLO 2>",roles:[{role:"readWrite",db:"ikaros"}]});'
   ```
4. Compose: do `mongo.command` přidat `--keyFile /etc/mongo-keyfile --auth`, namountovat
   keyfile (`- /opt/ikaros/mongo-keyfile:/etc/mongo-keyfile:ro`); healthcheck mongosh
   doplnit `-u admin -p <HESLO 1> --authenticationDatabase admin`.
5. Backend env: `MONGODB_URI: mongodb://ikaros:<HESLO 2>@mongo:27017/ikaros?replicaSet=rs0&authSource=ikaros`
   (hesla přes GitHub secrets, ne natvrdo).
6. `docker compose up -d` (mongo + backend restart) → ověř `/api/health` + login v appce.
**Rollback:** odebrat `--auth --keyFile` z command + vrátit URI; users v DB nevadí.

## 3) Redis auth (styl 5)

**Postup:** `redis.command` → `["redis-server","--appendonly","yes","--requirepass","<HESLO>"]`,
healthcheck `redis-cli -a <HESLO> ping`, backend `REDIS_URL: redis://:<HESLO>@redis:6379`.
Stejné okno jako Mongo (jeden restart). **Rollback:** odebrat requirepass.

## 4) E-mail doručitelnost — SPF / DKIM / DMARC (DNS)

**Stav:** maily jdou přes Gmail SMTP (`SMTP_USER` gmail účet) → SPF/DKIM řeší Google,
ALE jen pokud `MAIL_FROM` = tentýž gmail. Pokud `MAIL_FROM` je vlastní doména
(projekt-ikaros.com), bez DNS záznamů padají maily do spamu.
**Postup (DNS u registrátora):**
- SPF: TXT `@` → `v=spf1 include:_spf.google.com ~all`
- DKIM: v Google účtu (Workspace) vygenerovat klíč → TXT `google._domainkey`;
  u obyčejného gmailu DKIM pro vlastní doménu NEJDE → `MAIL_FROM` nech gmail,
  nebo přejdi na transakční službu (Brevo/Resend free tier) — souvisí SMTP fronta.
- DMARC: TXT `_dmarc` → `v=DMARC1; p=quarantine; rua=mailto:<tvůj mail>`
**Ověř:** https://mxtoolbox.com → SPF/DKIM/DMARC check + testovací mail na mail-tester.com.

## 5) Host firewall + ulimit

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw enable            # POZOR: nejdřív ověř, že SSH port je povolený (jinak se odřízneš)
ufw status verbose    # 3001 NEMÁ být v seznamu povolených
```
Ulimit pro docker daemon většinou netřeba (compose má `ulimits.nofile 65536` per službu);
host default zkontroluj `ulimit -n` (pokud < 65536: `/etc/security/limits.conf`).

## 6) DB zálohy

**Stav:** nula záloh. Workflow `db-backup.yml` (FE repo, ručně spouštěný) dělá
`mongodump --archive --gzip` do `/opt/backups/mongo/` s retencí a diskovou pojistkou.
**Rozhodnutí, které zbývá (uživatel):**
- **Cíl mimo server** — lokální záloha nepřežije smrt disku. Doporučení: rclone na
  levný object storage (Backblaze B2 / Cloudflare R2, ~zdarma pro GB objemy) jako
  2. krok workflow, nebo aspoň `scp` na druhý stroj.
- **Automatizace** — až bude cíl mimo server, přidat do workflow `schedule:` cron
  (např. denně 04:00) — dnes je jen `workflow_dispatch` (ruční), aby zálohy na
  tomtéž disku nezaplnily server (viz disk incidenty 2026-07).
**Obnova:** `docker exec -i projekt-ikaros-mongo mongorestore --archive --gzip --drop < záloha.archive.gz`
(nejdřív na testovací instanci!). Zálohu OTESTUJ obnovou aspoň jednou.

## 7) TLS certifikáty

Reverse proxy (Caddy) obnovuje Let's Encrypt certy automaticky. Ověř:
`curl -vI https://<doména> 2>&1 | grep expire` — pokud < 30 dní a neobnovuje se,
zkontroluj Caddy logy. Do IaC: Caddyfile verzovat v repu (dnes žije jen na serveru —
při reinstalu serveru se ztratí; zkopíruj ho do `docs/ops/Caddyfile.example`).

## 8) Deploy rollback (styl 31 — zbývá)

Deploy dělá prune+rebuild `latest` → není k čemu se vrátit. Návrh (zatím NEimplementováno,
vyžaduje úpravu deploy.yml + otestování na reálném deployi): tagovat image `ikaros-be:<git sha>`,
`latest` jen alias; rollback workflow = `docker tag <předchozí sha> latest && compose up -d`.
Neimplementuji naslepo — změna deploy pipeline se nedá otestovat bez ostrého běhu.
