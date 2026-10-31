# publisher

TryPost self-hosted em `https://publisher.rheav.dev` (VPS, EasyPanel). Este repo só guarda o workflow que builda a imagem `ghcr.io/rheav/trypost` com o domínio do WebSocket gravado no bundle, e o plano de deploy em `docs/`.

Atualizar: `gh workflow run build-image.yml -f ref=vX.Y.Z` → trocar a tag da imagem no serviço `publisher/app` do EasyPanel → Deploy. Migrations rodam no boot.

Antes de cada bump de versão: (1) `pg_dump` do banco `trypost` (serviço `publisher-db`), porque as migrations rodam sozinhas no boot; (2) `diff` entre o `config/horizon.php` da tag nova e o `horizon.php` deste repo, e atualizar o mount de arquivo no EasyPanel se o upstream mudou filas ou supervisores. O mount congela a cópia daqui por cima do arquivo da imagem.

Primeiro usuário: `/register` é 404 no self-hosted (exige convite); o usuário inicial foi criado com `php artisan db:seed --class=UserSeeder --force` e a senha trocada em seguida.
