# Capa própria do reel (imagem) no TryPost

Aprovado pelo usuário em 2026-11-16 (abordagem B).

## Por quê

O usuário quer escolher a capa dos reels que agenda (Samuel Magi e as outras contas). Hoje o TryPost v2.0.0 só deixa
escolher um quadro do vídeo (`meta.cover_offset_ms`, enviado como `thumb_offset`). A capa que ele quer é uma imagem
própria, e quer pôr pela tela do TryPost; o Claude também agenda pelo MCP e precisa pôr a mesma capa.

## O que muda

- Um vídeo de um post ganha `meta.cover_url`: o endereço público de uma imagem de capa que o próprio TryPost guarda.
- No Instagram, um reel (e o vídeo único de um `instagram_feed`, que sai como reel) é criado com `cover_url`. O
  `thumb_offset` continua indo junto; pela Meta, com os dois vale o `cover_url`
  (developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media).
- Outras redes ignoram o campo (TikTok e Pinterest seguem com o quadro escolhido; Facebook não tem capa).

## Onde a imagem fica

`covers/<uuid>.jpg` no disco padrão (`public` em produção: https://publisher.rheav.dev/storage/covers/…), fora da
tabela `media`. Assim a limpeza de uploads temporários (24 h, `PruneTemporaryUploads`) não a apaga antes do post
sair. A imagem enviada é convertida para JPEG sRGB, reduzida para no máximo 1080×1920 sem cortar, até 8 MB (regras de
capa da Meta: JPEG, 8 MB, 9:16 recomendado).

Custo aceito pelo usuário: apagar o post deixa o JPEG da capa no disco (poucos KB). Duplicar um post reaproveita a mesma
capa.

## Como a capa entra

- **Tela:** a aba "Capa" do editor de mídia (`MediaEditorThumbnailPanel.vue`), que hoje tem o controle de segundos,
  ganha "Imagem própria": escolher arquivo, prévia, Remover. Uma linha diz que a imagem vale para o Instagram e que o
  segundo escolhido continua valendo onde não há capa própria.
- **API:** `POST /api/media/covers` (token de API), multipart `cover`, responde `{ url }`. A tela usa a mesma ação por
  uma rota da sessão (`app.media.covers.store`).
- **MCP:** a mídia de `create-post-tool`/`update-post-tool` aceita `meta.cover_url` (o `url` que a API devolveu). A
  descrição das tools passa a dizer isso.

## Validação

`cover_url` é string e só endereço de `covers/` deste TryPost (`Storage::url('covers/')`): nenhum endereço de fora,
para que a Meta só busque arquivos nossos. Erro com mensagem traduzida. A regra de `meta` não vê o tipo do item, então
uma imagem com `cover_url` é aceita e o campo é ignorado: só o publicador de reel o usa.

## Entrega

Patch `patches/reel-cover-image.patch` sobre o upstream `v2.0.0`; o workflow passa a aplicar todos os
`patches/*.patch` em ordem e roda os testes tocados antes do build; imagem `v2.0.0-r2`; troca da tag no EasyPanel, com
`pg_dump` antes e longe dos horários de post agendados.

## Riscos

- A doc da Meta mostra `cover_url` em graph.facebook.com e não diz se vale no login do Instagram (graph.instagram.com:
  as 3 contas são `Platform::Instagram`). Duas provas, com o ok do usuário em cada uma:
  1. **Antes de construir (sonda):** criar um container de reel com `cover_url` sem publicar (expira em 24 h), com o
     token da conta lido do banco dentro do container do TryPost e nunca impresso. Erro de parâmetro → o plano para.
     `FINISHED` só prova que o campo não é recusado, não que a capa é usada.
  2. **Aceite:** o primeiro post real agendado com capa que o usuário escolher; depois de publicado, o
     `thumbnail_url` do reel (API) e a grade do perfil mostram a capa. Nunca um post publicado só para teste.
- Cada atualização do upstream reaplica o patch; ele quebra se os arquivos tocados mudarem.

## Decisões do construtor (2026-11-16)

- O Claude agenda pelo Claude Code, que tem shell e a chave de API (Keychain `aquecimento`, conta `trypost-api`): a capa
  sobe por `POST /api/media/covers` e entra no MCP como `meta.cover_url`. Uma tool de MCP para subir a capa fica fora.
- As mensagens novas entram nos 16 idiomas (o `LocalizationParityTest` do upstream exige as mesmas chaves): pt-BR e en
  traduzidos, os outros com o texto em inglês.
- Push do fork, run do workflow e troca da imagem no EasyPanel só com o ok do usuário, num horário longe dos posts.

## Abordagens

- **B — arquivo ao lado (escolhida):** `covers/` + `meta.cover_url`; patch pequeno.
- A — a capa como mídia do post (cópia e exclusão junto do post): mais correta, mas mexe em `SyncOwnedMedia`, cópias e
  exclusão; patch grande e frágil a cada atualização.

## Fora

A capa na cópia do Facebook; capa em carrossel; apagar o JPEG junto com o post.
