# Ops runbook — kroky vyžadující ruční zásah na serveru

> Vzniklo 2026-07-12 při hromadné opravě dluhů. Tyto položky NEJDOU udělat z kódu —
> vyžadují přístup k serveru / DNS / koordinované okno s restartem. Každá sekce má
> ověřovací krok PŘED zásahem (nedělej naslepo) a rollback poznámku.
> Souvisí: `docs/dluhy.md` (FE repo) → D-SEC-GAP / D-LAUNCH-GAP / D-AUDIT.

---

## 1) Backend port jen pro proxy (styl 5)

**Stav (23.6, 2026-07-19): UZAVŘENO ZJIŠTĚNÍM — loopback bind je na této
infrastruktuře ZAKÁZANÝ; původní předpoklad sekce byl mylný.**
**Skutečná topologie (ověřeno server-check workflow + testy zvenku):**
- Stroj má JEN privátní IP (10.10.10.111 + docker bridge); veřejnou 5.39.203.33
  drží NAT/edge proxy POSKYTOVATELE (leafhost) na jiném stroji. Žádný Caddy na
  hostu neexistuje (`/etc/caddy` není, žádná proxy služba/kontejner).
- TLS ukončuje edge poskytovatele a na tento stroj přeposílá po interní síti
  → bind na 127.0.0.1 by odřízl produkci (NIKDY nedělat).
- Porty 3001/8080/27017 NAT do internetu NEPOUŠTÍ (timeout), 8081 refused —
  ověřeno zvenku 2026-07-19. Původní hrozba „kdo zná IP:3001, obchází TLS"
  tedy veřejně neexistuje.
**Zbytkové riziko VYŘEŠENO (23.6, 2026-07-19) přes `server-hardening.yml`
(FE repo, workflow_dispatch, režimy diagnose/apply s auto-rollbackem):**
- `matrix-mongodb` (stará .NET DB, `/opt/matrix`) → publish `127.0.0.1:27017`
  (záloha compose: `*.bak-23-6`; interní komunikace jede přes docker síť
  `matrix_matrix-network`, publish nikdo nepotřeboval).
- iptables `DOCKER-USER`: RETURN pro edge proxy **10.10.10.104** + host
  10.10.10.111 + ESTABLISHED/RELATED, **DROP zbytek 10.10.10.0/24**, RETURN
  ostatní (veřejný traffic jde vždy přes edge, přímo nic nechodí). Persistence:
  `/opt/ikaros-hardening/docker-user.sh` + systemd `docker-user-hardening.service`.
- **Symptom „web najednou nejede po ničem"** = poskytovatel změnil IP edge
  proxy → na serveru: `systemctl disable --now docker-user-hardening &&
  iptables -F DOCKER-USER && iptables -A DOCKER-USER -j RETURN`, pak zjistit
  novou IP z `docker logs projekt-ikaros-fe` a upravit skript.
- POZOR: ufw docker-proxy porty stejně OBCHÁZEJÍ (proto DOCKER-USER, ne ufw).
Mongo/Redis auth ikaros stacku (§2–3) zůstává na kartě 30.5.

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

**Stav (23.6, 2026-07-19): ověřeno — ufw `Status: inactive`. Rozhodnutí: NEZAPÍNAT teď.**
Důvody: ① všechny exponované porty jsou docker-proxy → OBCHÁZEJÍ ufw (chránil by
jen sshd), ② stroj je za NAT poskytovatele — z internetu jsou porty stejně
filtrované (§1), ③ riziko odříznutí SSH bez konzole poskytovatele. Interní síť
řešit přes DOCKER-USER chain (karta 30.5, viz §1).

Původní postup (NEAKTUÁLNÍ pro tuto topologii, necháno pro případ stěhování na
VPS s veřejnou IP):
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

**Oprava (23.6, 2026-07-19):** na hostu ŽÁDNÝ Caddy neběží — TLS ukončuje a
certifikáty obnovuje edge proxy POSKYTOVATELE (leafhost), mimo naši správu
(viz §1 topologie). Ověření expirace zvenku funguje pořád:
`curl -vI https://<doména> 2>&1 | grep expire` — pokud < 30 dní a neobnovuje se,
řešit s podporou poskytovatele. Routing domény/portů (`/api` → 3001, zbytek →
8081) se konfiguruje v panelu poskytovatele — při změně domény/portů měnit TAM.

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

**Alert flow:** e-mail na nový issue (default z vytvoření projektů) + nativní
**Discord integrace** (Settings → Integrations → Discord → Add Installation →
authorizovat bota na serveru; pak v Alerts u pravidla akce „Send a Discord
notification" — kanál zadat **Channel ID**, ne jménem; Developer Mode →
Copy Channel ID). Nastavit u obou projektů, cíl = ops kanál (tentýž jako
Uptime/BE alerty). Vnitřní monitoring hlásí 5xx nezávisle → dvě cesty k témuž
incidentu.

## 11) Která verze právě běží? (24.1)

Před každým laděním „oprava nezabrala" **nejdřív ověř, že fix vůbec běží**. Záměr
(zelený deploy run v Actions) a realita (co je v kontejneru / bundlu) jsou dvě různé
věci — stale bundle 2026-07-14 byl přesně jejich rozpor.

**BE — jeden příkaz:**

```bash
curl -s https://www.projekt-ikaros.com/api/health | head -c 200
# → {"status":"ok","version":{"sha":"8b2e3b6","builtAt":"2026-07-19T21:55:03Z"},"uptimeSec":29641,...}
```

`version.sha` = zkrácený commit posledního **deploye**, `builtAt` čas toho deploye.
Porovnej se `git rev-parse --short HEAD`. Plní `deploy.yml` (krok „Stamp build
metadata" → `.env` → compose). `unknown` = image je starší než 24.1, nebo `.env`
proměnnou nedostal.

> **`uptimeSec` NENÍ důkaz nasazení.** Dává čas posledního *restartu*, takže restart
> z jiné příčiny (OOM — RSS baseline ~2,4 GB) vypadá jako čerstvý deploy. Když
> `uptimeSec` odpovídá kratší době než `builtAt`, kontejner se restartoval **bez**
> deploye → hledej příčinu (OOM, crash loop), ne nový kód.

**FE — grep markeru v bundlu** (FE verzi z health nezjistíš):

```bash
# 1) z posledního commitu dotýkajícího se src/ vyber UŽIVATELSKÝ text (přežije minifikaci)
git log -1 --pretty=%h -- src/
# 2) najdi lazy chunk, ve kterém má být
curl -s https://www.projekt-ikaros.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'
curl -s https://www.projekt-ikaros.com/assets/index-XXXX.js | grep -oE '"assets/<Stránka>-[A-Za-z0-9_-]+\.js'
# 3) grepni marker
curl -s https://www.projekt-ikaros.com/assets/<Stránka>-YYYY.js | grep -c '<hledaný text>'
```

`Last-Modified` na `index.html` dokazuje jen, že se *něco* buildilo — ne co v tom je.

**Kdy sha ≠ očekávání:** čas commitu ≠ čas pushe. Run spuštěný „hned po commitu"
mohl jet bez něj; ověř `git log -g refs/remotes/origin/main` (`update by push`).
Deploy gate 23.7 tohle **nezachytí** — kontroluje jen zelenou CI pro checkoutnutý
sha, takže nasazení staršího commitu projde zeleně. „Re-run jobs" na starém runu
buildí PŮVODNÍ sha; nový kód = tlačítko „Run workflow".

**Poznámka k PC-08:** `version` se vrací i v produkci, kde se ostatní detaily
strippují. Vědomé: autentizovaný endpoint by zabil celý use-case (`curl` bez tokenu),
`sha` je zkrácený na 7 znaků a u privátního repa neodemyká nic.
