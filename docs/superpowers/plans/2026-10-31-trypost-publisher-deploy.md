# TryPost em publisher.rheav.dev — Plano de deploy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TryPost v2.0.0 rodando na VPS (EasyPanel) em `https://publisher.rheav.dev`, com várias contas de Instagram conectadas via API oficial da Meta, uso pessoal.

**Architecture:** Imagem própria do TryPost (mesmo Dockerfile upstream, target `production`) buildada no GitHub Actions com o domínio do WebSocket gravado no bundle, publicada em `ghcr.io/rheav/trypost`. Na VPS, no projeto EasyPanel `my-projects`, 3 serviços: `publisher-db` (Postgres), `publisher-redis`, `publisher` (a imagem). Traefik do EasyPanel termina TLS e encaminha tudo para a porta 80 do `app`; o nginx interno já faz proxy de `/app/` e `/apps/` para o Reverb, então um único domínio e uma única porta bastam.

**Tech Stack:** TryPost v2.0.0 (Laravel 13, Vue, Horizon, Reverb), Postgres 16, Redis 7, EasyPanel (Docker Swarm + Traefik 3), GitHub Actions + GHCR, Cloudflare DNS, Meta "Instagram API with Instagram Login".

**Spec:** este documento, seção "Decisões" (não há spec separada; a avaliação foi feita na conversa de 2026-10-31).

## Decisões

| Item | Decisão | Motivo |
|---|---|---|
| Versão | tag `v2.0.0` (2026-10-10) | `main` está 30 commits à frente com migration pesada sem release; fresh install não precisa dela. |
| Imagem | build própria, não `ghcr.io/trypostit/trypost` | a publicada grava `VITE_REVERB_HOST=localhost:8080`; WebSocket não funcionaria no domínio. |
| Onde buildar | GitHub Actions (amd64) | Mac sem Docker (e é arm64); VPS tem 3,7 GB livres e 16 containers, build de PHP+Vite lá é risco. |
| Pacote GHCR | público | só contém código AGPL público + chave pública do Reverb; evita credencial de registry na VPS. |
| DNS | A `publisher.rheav.dev` → `23.94.0.233`, **proxied (nuvem laranja)** | o firewall da VPS (`DOCKER-USER`) só aceita 80/443 vindo dos IPs da Cloudflare; DNS-only não responde. Zona em SSL "Full", origem com o cert self-signed do EasyPanel. Custo: upload pela UI limitado a 100 MB (Cloudflare free); vídeo maior entra por URL/Drive. |
| Mídia | `FILESYSTEM_DISK=public`, volume em `/var/www/html/storage/app` | Meta baixa a mídia por URL pública `https://publisher.rheav.dev/storage/...`. R2 fica como upgrade futuro. |
| E-mail | `MAIL_MAILER=log` | uso solo, sem convites nem reset de senha por e-mail. |
| Banco/Redis | serviços próprios no projeto `publisher` | isolamento; Postgres alpine ocioso ~40 MB, Redis ~5 MB. |
| Chave Reverb | `publisher-reverb-key` (pública, vai no bundle) | precisa ser igual no build arg e no env de runtime. |
| Instagram | só "Instagram Login" (`INSTAGRAM_CLIENT_ID/SECRET`) | sem Página do Facebook. Caminho "Instagram (Facebook Business)" fica desligado. |
| Multi-conta | nada a configurar | no v2.0.0 o índice único de `social_accounts` é por identidade (workspace, platform, platform_user_id); a flag `ALLOW_MULTIPLE_SOCIAL_ACCOUNTS` foi removida. |

## Global Constraints

- Domínio: `publisher.rheav.dev`. VPS: `ssh vps` (`root@23.94.0.233`), sandbox desligado. Zona Cloudflare `rheav.dev` id `dc7e200cec2f2d4033c81d32c4084b53`, conta `abe911c210914d7ecc30d9521176c495`.
- Imagem: `ghcr.io/rheav/trypost:v2.0.0` e `:latest`, `linux/amd64`, target `production`, build args `VITE_REVERB_APP_KEY=publisher-reverb-key VITE_REVERB_HOST=publisher.rheav.dev VITE_REVERB_PORT=443 VITE_REVERB_SCHEME=https`.
- Segredos (APP_KEY, chaves Passport, senhas de DB/Redis, REVERB_APP_SECRET, INSTAGRAM_CLIENT_SECRET) só no env do EasyPanel e na cópia local `~/Code/apps/publisher/.env.production` (gitignored). Nunca no repo.
- Repo `rheav/publisher` (público) guarda só workflow + docs. Commits sem atribuição a Claude. Push só quando o usuário pedir.
- Depois de qualquer deploy: não monitorar. Verificar uma vez, com comando explícito.
- Projeto EasyPanel: `my-projects` (o plano free limita a 3 projetos e os 3 já existem). Serviços `publisher-db`, `publisher-redis`, `publisher`. Hostnames internos `<projeto>_<serviço>` → `my-projects_publisher-db`, `my-projects_publisher-redis`. Swarm: `my-projects_publisher`.

## Review Focus

1. **Upload de Reel > 100 MB**: só funciona com DNS-only. Teste da Task 3 confirma nuvem cinza; Task 5 confirma `client_max_body_size 1G` respondendo (upload de 150 MB via UI é o teste manual final).
2. **URLs geradas em `http://` atrás do Traefik** (assets quebrados, callback OAuth não bate): `TRUSTED_PROXIES=*`. Task 5 verifica que `/up` e a página de login carregam sem mixed content e que o callback mostrado em Configurações → Canais é `https://`.
3. **Container reinicia em loop** por falta de `PASSPORT_PRIVATE_KEY` ou `APP_KEY`: entrypoint sai com erro. Task 5 lê o log e exige a linha `[entrypoint] ready — handing off to supervisord`.
4. **WebSocket morto** (chave do bundle ≠ `REVERB_APP_KEY` do env, ou Traefik sem upgrade): Task 5 verifica `wss://publisher.rheav.dev/app/publisher-reverb-key` respondendo 101.
5. **Meta não consegue baixar a mídia** (symlink `public/storage` ausente, disco errado): Task 6 faz `curl -I` na URL da mídia antes da primeira publicação.
6. **RAM**: Horizon em `production` escala até 10+10+3+4+4+... workers. Task 4 põe limite de memória de 2048 MB no `app`; Task 5 mede com `docker stats`.
7. **Conta que não é Business/Creator ou não é Tester** falha no OAuth com erro da Meta. Task 6 confere o tipo e o convite aceito antes de clicar em Conectar.

---

### Task 1: Repo `rheav/publisher` + workflow que builda a imagem

**Files:**
- Create: `~/Code/apps/publisher/.github/workflows/build-image.yml`
- Create: `~/Code/apps/publisher/.gitignore` (`.env.production`)
- Create: `~/Code/apps/publisher/README.md` (3 linhas: o que é, como atualizar)

**Interfaces:**
- Produces: imagem `ghcr.io/rheav/trypost:v2.0.0` (e `:latest`) pública.

- [ ] **Step 1: Escrever o workflow**

```yaml
name: Build TryPost image
on:
  workflow_dispatch:
    inputs:
      ref:
        description: tag do trypostit/trypost
        default: v2.0.0
        required: true
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
        with:
          repository: trypostit/trypost
          ref: ${{ inputs.ref }}
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          target: production
          platforms: linux/amd64
          push: true
          tags: |
            ghcr.io/rheav/trypost:${{ inputs.ref }}
            ghcr.io/rheav/trypost:latest
          build-args: |
            VITE_REVERB_APP_KEY=publisher-reverb-key
            VITE_REVERB_HOST=publisher.rheav.dev
            VITE_REVERB_PORT=443
            VITE_REVERB_SCHEME=https
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Commitar e subir** (repo local já existe com o plano)

```bash
cd ~/Code/apps/publisher && git add -A && git commit -m "ci: build TryPost image for publisher.rheav.dev"
gh repo create rheav/publisher --public --source=. --push
```

- [ ] **Step 3: Disparar o build e esperar**

```bash
gh workflow run build-image.yml -R rheav/publisher -f ref=v2.0.0
sleep 20 && gh run watch -R rheav/publisher --exit-status $(gh run list -R rheav/publisher -L1 --json databaseId -q '.[0].databaseId')
```
Esperado: run verde (15 a 25 min na primeira vez; o estágio de extensões PHP é o lento).

- [ ] **Step 4 (usuário, 1 clique): tornar o pacote público**

Abrir `https://github.com/users/rheav/packages/container/trypost/settings` → Danger Zone → Change visibility → Public. (GitHub não expõe isso por API.)

- [ ] **Step 5: Verificar puxando na VPS**

```bash
ssh vps 'docker pull ghcr.io/rheav/trypost:v2.0.0 && docker run --rm ghcr.io/rheav/trypost:v2.0.0 sh -c "grep -rl publisher.rheav.dev /var/www/html/public/build | head -1"'
```
Esperado: pull sem pedir login; `grep` devolve o caminho de um `.js` do bundle (o domínio do Reverb está gravado nele).

- [ ] **Step 6: Commit** (já feito no Step 2; nada novo).

---

### Task 2: Gerar segredos

**Files:**
- Create: `~/Code/apps/publisher/.env.production` (gitignored; cópia do que vai pro EasyPanel)

**Interfaces:**
- Produces: valores `APP_KEY`, `DB_PASSWORD`, `REDIS_PASSWORD`, `REVERB_APP_SECRET`, `PASSPORT_PRIVATE_KEY`, `PASSPORT_PUBLIC_KEY`.

- [ ] **Step 1: Gerar chaves simples**

```bash
echo "APP_KEY=base64:$(openssl rand -base64 32)"
echo "DB_PASSWORD=$(openssl rand -hex 24)"
echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
echo "REVERB_APP_SECRET=$(openssl rand -hex 32)"
```

- [ ] **Step 2: Gerar chaves Passport com o próprio artisan (na VPS, imagem já puxada)**

```bash
ssh vps 'docker run --rm -e APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ghcr.io/rheav/trypost:v2.0.0 php artisan passport:keys --show'
```
Salvar a saída em `oauth-private.key` e `oauth-public.key` (no scratchpad, apagar depois) e converter cada PEM para uma linha com `\n` literal (Laravel Passport troca `\n` por quebra real):
```bash
awk 'NF {printf "%s\\n", $0}' oauth-private.key
```

- [ ] **Step 3: Montar `.env.production`** com o bloco da Task 4 e os valores acima. `chmod 600`.

- [ ] **Step 4: Verificar** que `.env.production` não aparece em `git status`.

---

### Task 3: DNS na Cloudflare

**Interfaces:**
- Produces: `publisher.rheav.dev` resolvendo para `23.94.0.233`, sem proxy.

- [ ] **Step 1: Criar o registro** via MCP `cloudflare-api` `execute`:

```js
cloudflare.request({ method: "POST", path: "/zones/dc7e200cec2f2d4033c81d32c4084b53/dns_records",
  body: { type: "A", name: "publisher", content: "23.94.0.233", proxied: false, ttl: 1, comment: "TryPost (EasyPanel)" } })
```

- [ ] **Step 2: Verificar**

```bash
dig +short publisher.rheav.dev A
```
Esperado: exatamente `23.94.0.233` (um IP da Cloudflare aqui = proxy ligado = errado).

---

### Task 4: Projeto `publisher` no EasyPanel (db, redis, app)

**Interfaces:**
- Consumes: imagem (Task 1), segredos (Task 2), DNS (Task 3), token da API do EasyPanel (usuário gera em `https://easypanel.rheav.dev` → Settings → API Tokens e cola no chat; fica só na sessão, não em arquivo).
- Produces: serviços `publisher_db`, `publisher_redis`, `my-projects_publisher`; domínio `publisher.rheav.dev` → `app:80` com HTTPS.

Chamadas tRPC: `POST https://easypanel.rheav.dev/api/trpc/<método>` com `Authorization: Bearer <token>` e body `{"json": {...}}`. Nomes esperados: `projects.createProject`, `services.postgres.createService`, `services.redis.createService`, `services.app.createService`, `services.app.updateSourceImage`, `services.app.updateEnv`, `services.app.updateMounts`, `services.app.updateResources`, `domains.createDomain`, `services.app.deployService`. Se algum nome falhar com 404, confirmar pelo painel (aba Network do navegador ao fazer a ação à mão) antes de insistir. Fallback aceitável: criar pelo painel com os valores exatos abaixo.

- [ ] **Step 1: Validar o token**

```bash
curl -s https://easypanel.rheav.dev/api/trpc/projects.listProjectsAndServices -H "Authorization: Bearer $EP_TOKEN" | head -c 300
```
Esperado: JSON com os projetos `back-ends` e `my-projects`.

- [ ] **Step 2: Criar projeto e banco**

`projects.createProject` `{name:"publisher"}`; `services.postgres.createService` `{projectName:"publisher", serviceName:"db", image:"postgres:16-alpine", password:<DB_PASSWORD>}`; `services.redis.createService` `{projectName:"publisher", serviceName:"redis", image:"redis:7-alpine", password:<REDIS_PASSWORD>}`.
Depois `services.postgres.inspectService` e anotar usuário e nome do banco que o EasyPanel criou (ele mostra a "Internal Connection URL"). Esses valores entram em `DB_USERNAME` / `DB_DATABASE` abaixo.

- [ ] **Step 3: Criar o `app`** com `services.app.createService` `{projectName:"publisher", serviceName:"app"}` e `services.app.updateSourceImage` `{..., image:"ghcr.io/rheav/trypost:v2.0.0"}`.

- [ ] **Step 4: Env** (`services.app.updateEnv`, campo `env` é a string abaixo com os segredos preenchidos):

```env
APP_NAME=Publisher
APP_ENV=production
APP_DEBUG=false
APP_KEY=<Task 2>
APP_URL=https://publisher.rheav.dev
APP_LOCALE=pt-BR
SELF_HOSTED=true
TRYPOST_TARGET=production
TRUSTED_PROXIES=*
LOG_CHANNEL=stderr
LOG_LEVEL=info

DB_CONNECTION=pgsql
DB_HOST=my-projects_publisher-db
DB_PORT=5432
DB_DATABASE=<do inspectService>
DB_USERNAME=<do inspectService>
DB_PASSWORD=<Task 2>

REDIS_HOST=my-projects_publisher-redis
REDIS_PORT=6379
REDIS_PASSWORD=<Task 2>
QUEUE_CONNECTION=redis
CACHE_STORE=redis
SESSION_DRIVER=database
BROADCAST_CONNECTION=reverb

REVERB_APP_ID=1001
REVERB_APP_KEY=publisher-reverb-key
REVERB_APP_SECRET=<Task 2>
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http

PASSPORT_PRIVATE_KEY="<Task 2, uma linha com \n>"
PASSPORT_PUBLIC_KEY="<Task 2, uma linha com \n>"

FILESYSTEM_DISK=public
MAIL_MAILER=log
MAIL_FROM_ADDRESS=publisher@rheav.dev
MAIL_FROM_NAME=Publisher
HORIZON_ALLOWED_EMAILS=<e-mail que você vai usar no cadastro>
CHANGELOG_ENABLED=true
```
`INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` entram na Task 6.

- [ ] **Step 5: Volume, limite de memória, domínio**

`services.app.updateMounts` `{mounts:[{type:"volume", name:"storage", mountPath:"/var/www/html/storage/app"}]}`.
`services.app.updateResources` `{memoryLimit: 2048, memoryReservation: 0, cpuLimit: 0, cpuReservation: 0}`.
`domains.createDomain` `{projectName:"publisher", serviceName:"app", host:"publisher.rheav.dev", https:true, port:80, path:"/"}`.

- [ ] **Step 6: Deploy** `services.app.deployService` `{projectName:"publisher", serviceName:"app"}`. Não monitorar. Seguir para a Task 5 quando for verificar.

---

### Task 5: Verificar o primeiro boot e criar o usuário

- [ ] **Step 1: Log do entrypoint**

```bash
ssh vps 'docker service logs my-projects_publisher --tail 60 2>&1 | grep -E "\[entrypoint\]|ERROR|error"'
```
Esperado: `running migrations` … `ready — handing off to supervisord`. Sem `PASSPORT_PRIVATE_KEY and PASSPORT_PUBLIC_KEY must be set`.

- [ ] **Step 2: HTTPS e health**

```bash
curl -sI https://publisher.rheav.dev/up | head -1
curl -sI https://publisher.rheav.dev/login | grep -iE "^HTTP|location"
```
Esperado: `HTTP/2 200` nos dois (login sem redirect para `http://`).

- [ ] **Step 3: WebSocket**

```bash
curl -s --http1.1 -o /dev/null -w "%{http_code}\n" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" "https://publisher.rheav.dev/app/publisher-reverb-key?protocol=7&client=js&version=8"
```
Esperado: `101`. Obrigatório `--http1.1`: em HTTP/2 o curl descarta `Connection/Upgrade` e o Reverb devolve 500 (não é bug do servidor).

- [ ] **Step 4: Primeiro usuário.** `/register` dá 404 de propósito no self-hosted (exige convite). Criar com o seeder, uma vez:
```bash
ssh vps 'docker exec $(docker ps -q -f name=my-projects_publisher.1 | head -1) php artisan db:seed --class="Database\\Seeders\\UserSeeder" --force'
```
Cria `admin@trypost.it` / `password`. Usuário entra, troca e-mail e senha em Configurações, fuso `America/Sao_Paulo`, idioma pt-BR.

- [ ] **Step 5: RAM.** Horizon em `production` com `balance=auto|simple` mantém 1 worker por fila (25 workers, 1,8 GB). `config/horizon.php` com `balance=false` montado como arquivo pelo EasyPanel (cópia em `horizon.php` na raiz do repo).

```bash
ssh vps 'docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}" | grep publisher'
```
Esperado: `app` abaixo de 1,2 GB em repouso. Se passar de 1,5 GB, baixar `memoryLimit` não resolve; anotar e tratar depois (ajuste de Horizon via fork).

- [ ] **Step 6: Commit no repo `publisher`**: README com a URL e o procedimento de atualização (bump do `ref` → run → trocar tag da imagem no EasyPanel → deploy; migrations rodam no boot).

---

### Task 6: App na Meta e contas de Instagram

**Interfaces:**
- Consumes: `https://publisher.rheav.dev/accounts/instagram/callback` (redirect URI fixa do TryPost).
- Produces: `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` no env; N contas conectadas.

- [ ] **Step 1 (usuário, por conta): tipo de conta.** Instagram → Configurações → Tipo de conta → Business ou Creator.

- [ ] **Step 2 (usuário, uma vez): app na Meta.** `https://developers.facebook.com/apps/` → Create app → caso de uso **"Manage messaging & content on Instagram"**. Em Permissions and features adicionar `instagram_business_basic` e `instagram_business_content_publish`. Em **API setup with Instagram login** → Set up → Redirect URL `https://publisher.rheav.dev/accounts/instagram/callback`. Copiar **Instagram app ID** e **Instagram app secret** dessa mesma tela (não os do app Meta em App settings).

- [ ] **Step 3 (usuário, por conta): testers.** App roles → Roles → Add People → **Instagram Tester** → cada conta. Em cada conta, aceitar: Instagram → Configurações → Permissões do site → Apps e sites → Convites de testador.

- [ ] **Step 4: Env + redeploy.** Acrescentar ao env do `app`:
```env
INSTAGRAM_CLIENT_ID=<Instagram app ID>
INSTAGRAM_CLIENT_SECRET=<Instagram app secret>
```
`services.app.deployService`. Verificar uma vez com o Step 1 da Task 5.

- [ ] **Step 5 (usuário): conectar.** Canais → Instagram → Conectar. TryPost manda `force_reauth=true`, então a tela da Meta pede login toda vez: entrar com a conta certa, autorizar. Repetir por conta. Esperado: cada conta aparece como canal próprio no mesmo workspace.

- [ ] **Step 6: Teste de publicação.** Subir uma foto num post para 1 conta, publicar agora. Antes de confirmar, pegar a URL da mídia na UI e:
```bash
curl -sI "https://publisher.rheav.dev/storage/<caminho>" | head -1
```
Esperado: `HTTP/2 200`. Depois o post aparece como publicado e existe no Instagram. Log da fila:
```bash
ssh vps 'docker service logs my-projects_publisher --tail 100 2>&1 | grep -iE "instagram|failed"'
```

- [ ] **Step 7: Tag.** No repo `publisher`, `git tag -a v0.1.0 -m "TryPost 2.0.0 live em publisher.rheav.dev"` (esquema de versão a confirmar com o usuário).

---

## Fora do escopo (dito de propósito)

Backup do Postgres (EasyPanel faz para S3/R2 se quiser depois), SMTP real, R2 para mídia, Threads/Facebook/TikTok, MCP/API keys, monitoramento. Tudo é ligar depois sem refazer nada.
