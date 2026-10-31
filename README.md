# publisher

TryPost self-hosted em `https://publisher.rheav.dev` (VPS, EasyPanel). Este repo só guarda o workflow que builda a imagem `ghcr.io/rheav/trypost` com o domínio do WebSocket gravado no bundle, e o plano de deploy em `docs/`.

Atualizar: `gh workflow run build-image.yml -f ref=vX.Y.Z` → trocar a tag da imagem no serviço `publisher/app` do EasyPanel → Deploy. Migrations rodam no boot.
