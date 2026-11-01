# publisher

TryPost self-hosted em `https://publisher.rheav.dev` (VPS, EasyPanel). Este repo só guarda o workflow que builda a imagem `ghcr.io/rheav/trypost` com o domínio do WebSocket gravado no bundle, e o plano de deploy em `docs/`.

Atualizar: `gh workflow run build-image.yml -f ref=vX.Y.Z` → trocar a tag da imagem no serviço `publisher/app` do EasyPanel → Deploy. Migrations rodam no boot.

Patches locais em `patches/*.patch` são aplicados pelo workflow sobre o upstream (`git apply`, falha o build se não encaixar mais) e a imagem sai com sufixo (`-r1` por padrão): `gh workflow run build-image.yml -f ref=vX.Y.Z -f suffix=-r1` → tag `vX.Y.Z-r1`. Hoje: `metrics-interval.patch` cria `PUBLICATION_METRICS_INTERVAL_HOURS` (horas, 1-24; `24` = upstream, 03:00 UTC). Valor no env do EasyPanel: `6`.

Antes de cada bump de versão: (1) `pg_dump` do banco `trypost` (serviço `publisher-db`), porque as migrations rodam sozinhas no boot; (2) `diff` entre o `config/horizon.php` da tag nova e o `horizon.php` deste repo, e atualizar o mount de arquivo no EasyPanel se o upstream mudou filas ou supervisores. O mount congela a cópia daqui por cima do arquivo da imagem.

Primeiro usuário: `/register` é 404 no self-hosted (exige convite); o usuário inicial foi criado com `php artisan db:seed --class=UserSeeder --force` e a senha trocada em seguida.
