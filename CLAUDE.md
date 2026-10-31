# publisher — TryPost self-hosted em https://publisher.rheav.dev

Instância pessoal do TryPost v2.0.0 (VPS/EasyPanel, projeto `my-projects`, serviços `publisher`, `publisher-db`, `publisher-redis`). Uso solo: 3 contas de Instagram. Plano de deploy em `docs/superpowers/plans/`.

## Operar via MCP (servidor `TryPost`, escopo de usuário do Claude Code)

- Comece por `list-social-accounts-tool` (canais) e `list-content-types-tool` (regras de mídia, limites de texto e `meta` por rede). Nunca escolha `content_type` sem consultar.
- Horários nas tools são **UTC**. Os 3 canais estão em `America/New_York` (fuso das contas, sem meta semanal nem horários de fila, por decisão do usuário em 2026-10-31); o usuário mora em `America/Sao_Paulo`. Quando ele disser "9h", perguntar se é horário de NY (do público) ou de SP, a menos que já tenha dito.
- Fila: `list-free-slots-tool` → `create-post-tool` com `queue`/`queue_slot`. Horário fixo: `scheduled_at`.
- Mídia: `request-media-upload-tool` (URL assinada, 15 min, uso único) ou `attach-media-from-url-tool` (URL pública direta, sem redirect). Upload vale 24 h e por post.
- Instagram (conforme `docs/trypost/platforms/instagram.md`): só Business/Creator. `instagram_feed` = 1 a 10 imagens/vídeos (carrossel é feed com várias mídias; imagem 8 MB, proporção 3:4 a 1.91:1; vídeo 100 MB, 60 s). `instagram_reel` = 1 vídeo MP4/MOV, 300 MB, 15 min. `instagram_story` = 1 mídia, 24 h, sem legenda (texto não é enviado). Máx. 5 hashtags. GIF não. Limite da Meta: 100 posts/dia por conta. Canais são `instagram` (Instagram Login); música em Reel só existe via `instagram-facebook`.
- Antes de publicar, `preview-post-tool`. Confirme com o usuário antes de `publish-post-tool` ou de agendar em lote.
- Reconectar canal (token de 60 dias) é no app, dentro do perfil AdsPower/proxy daquela conta; a API não conecta contas.

## Documentação local

`docs/trypost/` (markdown baixado de trypostit.mintlify.app; atualizar com `scripts/fetch-docs.sh`). Índice em `docs/trypost/llms.txt`. Páginas úteis: `platforms/instagram.md`, `api-reference/guides/posting.md`, `api-reference/guides/media-uploads.md`, `knowledge-base/*`, `ai/*`. Ler só a página necessária, não a pasta inteira.

## Infra

- Deploy/env pelo EasyPanel (API REST em `/api/<op>`; token é pedido ao usuário, não fica em arquivo).
- Segredos só em `.env.production` (gitignored). Imagem buildada por `.github/workflows/build-image.yml`; atualizar = bump do `ref` → run → trocar tag no EasyPanel → deploy. Antes: `pg_dump` e diff do `horizon.php` com o upstream.
- Após deploy: não monitorar; uma verificação única (`/up` 200, log do entrypoint "ready").
