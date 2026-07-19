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

**Stav (23.1, 2026-07-19): automatizováno.** Workflow `db-backup.yml` (FE repo) běží
denně (cron 02:00 UTC = ~04:00 léto): `mongodump --archive --gzip` →
`/opt/backups/mongo/` (lokální retence 5 — rychlý přístup, NENÍ záloha, tentýž disk)
→ rclone upload do Backblaze B2 `mongo/daily/` (retence 8 dní) + v neděli
server-side kopie do `mongo/weekly/` (retence 29 dní) = **7 denních + 4 týdenní
off-site**. B2 přístup: GitHub secrets `B2_KEY_ID`/`B2_APP_KEY` + var `B2_BUCKET`
(FE repo); na serveru žádný secret (rclone env-var config přes SSH stdin).
Selhání → Discord (secret `DISCORD_ALERT_WEBHOOK` = tentýž URL jako BE ops alerty).
**POZOR:** GitHub cron mívá zpoždění desítek minut; po 60 dnech bez aktivity repa
ho GitHub VYPNE — při delší pauze vývoje zkontrolovat, že běží.

**Test obnovy (restore drill):** workflow `db-restore-drill.yml` (FE repo),
1. den v měsíci + ručně: stáhne nejnovější daily z B2, ověří stáří < 48 h (hlídá,
že denní cron reálně běží), obnoví do čistého `mongo:7` (= verze prod) v runneru,
ověří počty kolekcí/dokumentů (users/worlds neprázdné). Výsledek + časy → Discord.
Naměřené časy (drill 2026-07-19, 110 kolekcí / 43 127 dokumentů): download ~10 s ·
restore ~7 s — ostrá obnova DB je tedy záležitost ~1 minuty i s ručními kroky.

**Ostrá obnova produkce (disaster recovery):**
1. Stáhni nejnovější zálohu z B2 (z libovolného stroje; klíče v B2 UI účtu):
   `rclone copyto b2:<bucket>/mongo/daily/<nejnovější> ikaros.archive.gz`
   — nebo použij lokální `/opt/backups/mongo/` (jen pokud disk serveru žije).
2. Na serveru: `docker exec -i projekt-ikaros-mongo mongorestore --archive --gzip --drop < ikaros.archive.gz`
3. `docker restart projekt-ikaros-be` + smoke test (login, načtení světa, chat).

**Vědomě nekryto:** `uploads-data` volume (média primárně na Cloudinary = off-site
z podstaty) a Meili (reindex při startu BE).

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

## 9) Externí uptime monitoring (23.2)

**Stav (2026-07-19): běží.** HetrixTools free (účet `tyky.projekt.ikaros@gmail.com`) —
externí dead-man switch: ohlásí i smrt celého serveru/proxy, kterou vnitřní monitoring
(sám mrtvý) neohlásí. 2 monitory à 1 min ze 4 EU lokací (Amsterdam/London/Frankfurt/
Warsaw), status flip až při shodě 50 %+1 lokací (= 3 ze 4, žádné plané poplachy):
- **Ikaros API health** → `https://www.projekt-ikaros.com/api/health` + keyword check
  `"status":"ok"` (case sensitive) — alert když keyword v odpovědi CHYBÍ. Kryje tím
  i `degraded` stav, který vrací HTTP 200 (plain HTTP monitor by ho neviděl).
- **Ikaros FE** → `https://www.projekt-ikaros.com/` (bez keywordu, čeká 200).
Notifikace: Contact List „Default Contact" → e-mail + Discord webhook „Uptime"
(tentýž kanál jako ops alerty; URL webhooku = secret, žije jen v HetrixTools
a v Discord nastavení serveru). Test notifikace doručena 2026-07-19.
**Proč ne UptimeRobot:** free tier má Discord/webhooky za paywallem (ceník vs.
stránka integrace si protiřečí) a ToS od 10/2024 zakazuje free plán pro komerční
projekty — s freemium Podporovatelem šedá zóna.
**Změna URL/domény = ruční úprava monitorů v HetrixTools** (nezapomenout při
případném stěhování domény).

## 10) Error tracking — Sentry (23.4)

**Co to dělá:** pády, které testeři nenahlásí (mlčky odejdou), vidíme v dashboardu.
FE: `@sentry/react` (render chyby přes GlobalErrorBoundary + `unhandledrejection`
+ `window.error`). BE: `@sentry/node` (5xx přes exception filtr + `unhandledRejection`
+ `uncaughtException` s flush před pádem). Oboje gated na DSN — prázdný = úplný no-op.

**Konfigurace:** Sentry SaaS free tier (5k eventů/měs.), **EU region** (de.sentry.io),
2 projekty: `ikaros-fe` (React) + `ikaros-be` (Node) → 2 DSN.
- FE repo GitHub **var** `VITE_SENTRY_DSN` (veřejný, zapéká se do bundlu; deploy z něj
  navíc odvozuje `SENTRY_HOST` pro nginx CSP `connect-src` — bez toho by prohlížeč
  eventy tiše blokoval).
- BE repo GitHub **secret** `SENTRY_DSN` (→ compose env → `main.ts` init).

**Ochrana dat (LH-13):** obě strany mají `beforeSend` scrubber — rekurzivně maže
klíče `authorization/cookie/password/token/secret/api[-_]key` z `request`/`extra`/
`contexts` (axios chyby jinak nesou JWT, hesla z login body, API klíče outbound
služeb). `tracesSampleRate: 0` = jen chyby, žádný performance tracing.

**Tunnel (adblock):** FE neposílá eventy přímo na `*.ingest.de.sentry.io` (adblockery
to blokují — živě ověřeno `ERR_BLOCKED_BY_ADBLOCKER`), ale na vlastní
`POST /api/monitoring/tunnel`; BE (`SentryTunnelController`) envelope přepošle.
Relay jen na host shodný s BE `SENTRY_DSN` (stejná org) → žádný open proxy;
výpadek ingestu = 200 `{relayed:false}` + warn log, žádný 5xx. Tzn. FE eventy
tečou PŘES backend — když BE leží, FE chyby z té doby v Sentry nebudou (kryje
je externí uptime monitoring §9).

**Kvóta:** free tier 5k eventů/měs. Při vyčerpání Sentry eventy zahazuje (nic
neúčtuje) — burst jedné rozbité stránky umí kvótu sníst; `ignoreErrors` filtruje
známý šum (ResizeObserver). Při chronickém přetékání: rate limit per-key v Sentry
(Settings → Client Keys → Rate Limits).

**Ověření po deployi:** FE — na živém webu v konzoli
`setTimeout(() => { throw new Error('sentry-test-fe') })` → event v `ikaros-fe`;
v Network tabu `POST /api/monitoring/tunnel` se statusem 200 (funguje i se
zapnutým adblockem — to je smysl tunelu). BE —
`docker compose -f docker-compose.prod.yml exec backend printenv SENTRY_DSN`
neprázdný. V testovacím eventu zkontrolovat, že `extra`/`request` neobsahuje
Authorization/heslo (scrubber žije).

**Alert flow:** Sentry umí e-mail notifikace na nový issue (default zapnuto);
Discord integraci free tier přímo nemá — stačí e-mail + pravidelný pohled do
dashboardu, ops Discord kryje 5xx alerty z vnitřního monitoringu (dvě nezávislé
cesty k témuž incidentu).
