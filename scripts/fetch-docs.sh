#!/usr/bin/env bash
# Baixa a documentação do TryPost (Mintlify) em markdown para docs/trypost/.
# Uso: scripts/fetch-docs.sh   (re-executar quando quiser atualizar)
set -euo pipefail
BASE="https://trypostit.mintlify.app"
OUT="$(cd "$(dirname "$0")/.." && pwd)/docs/trypost"
mkdir -p "$OUT"
curl -sfL "$BASE/llms.txt" -o "$OUT/llms.txt"
n=0; fail=0
grep -oE '\]\(https://docs\.trypost\.it/[^) ]+\.md\)' "$OUT/llms.txt" | sed -E 's/^\]\((.*)\)$/\1/' | sort -u | while read -r url; do
  path="${url#https://docs.trypost.it/}"
  mkdir -p "$OUT/$(dirname "$path")"
  if curl -sfL "$BASE/$path" -o "$OUT/$path"; then n=$((n+1)); else fail=$((fail+1)); echo "FALHOU $path" >&2; fi
done
find "$OUT" -name '*.md' | wc -l | xargs echo "páginas .md em $OUT:"
