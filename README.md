# publisher

TryPost self-hosted em `https://publisher.rheav.dev` (VPS, EasyPanel). Este repo só guarda o workflow que builda a imagem `ghcr.io/rheav/trypost` com o domínio do WebSocket gravado no bundle, e o plano de deploy em `docs/`.

Atualizar: `gh workflow run build-image.yml -f ref=vX.Y.Z` → trocar a tag da imagem no serviço `publisher/app` do EasyPanel → Deploy. Migrations rodam no boot.

Patches locais em `patches/*.patch` são aplicados pelo workflow sobre o upstream (`git apply`, falha o build se não encaixar mais) e a imagem sai com sufixo (`-r2` por padrão): `gh workflow run build-image.yml -f ref=vX.Y.Z -f suffix=-r2` → tag `vX.Y.Z-r2`. Os patches entram em ordem de nome, e o job `tests` roda os testes que eles adicionam ou tocam antes do build. Hoje:

- `metrics-interval.patch` (desde `-r1`) cria `PUBLICATION_METRICS_INTERVAL_HOURS` (horas, 1-24; `24` = upstream, 03:00 UTC). Valor no env do EasyPanel: `24` (= original; o usuário voltou atrás em 2026-11-01 por volume de chamadas).
- `reel-cover-image.patch` (desde `-r2`): capa própria do reel. A aba Capa do editor de mídia ganha "Imagem própria"; `POST /api/media/covers` (token de API, multipart `cover`) guarda um JPEG ≤ 1080×1920 em `covers/` e devolve `{url}`; a mídia de vídeo aceita `meta.cover_url` (só endereços de `covers/` deste TryPost) e o Instagram recebe `cover_url` no reel. Spec e plano em `docs/superpowers/`.

Para gerar um patch: clone do upstream na tag em `upstream/` (gitignored), o patch anterior aplicado e commitado como base, a mudança em commits por cima, `git -C upstream diff <base> > patches/<nome>.patch`.

Antes de cada bump de versão: (1) `pg_dump` do banco `trypost` (serviço `publisher-db`), porque as migrations rodam sozinhas no boot; (2) `diff` entre o `config/horizon.php` da tag nova e o `horizon.php` deste repo, e atualizar o mount de arquivo no EasyPanel se o upstream mudou filas ou supervisores. O mount congela a cópia daqui por cima do arquivo da imagem.

Primeiro usuário: `/register` é 404 no self-hosted (exige convite); o usuário inicial foi criado com `php artisan db:seed --class=UserSeeder --force` e a senha trocada em seguida.
