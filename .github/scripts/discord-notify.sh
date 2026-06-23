#!/usr/bin/env bash
# Envia status do workflow para Discord (requer DISCORD_WEBHOOK_URL).
set -euo pipefail

if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
  echo "DISCORD_WEBHOOK_URL não configurado — notificação ignorada."
  exit 0
fi

CONCLUSION="${CONCLUSION:-unknown}"
WORKFLOW="${WORKFLOW:-GitHub Actions}"
BRANCH="${BRANCH:-}"
URL="${URL:-}"
COMMIT="${COMMIT:-}"
ACTOR="${ACTOR:-}"

if [ "$CONCLUSION" = "success" ]; then
  EMOJI="✅"
  COLOR=3066993
else
  EMOJI="❌"
  COLOR=15158332
fi

SHORT_SHA="${COMMIT:0:7}"

jq -n \
  --arg username "Pazini GitHub" \
  --arg content "${EMOJI} **${WORKFLOW}** — \`${CONCLUSION}\`" \
  --argjson color "$COLOR" \
  --arg branch "$BRANCH" \
  --arg actor "$ACTOR" \
  --arg url "$URL" \
  --arg sha "$SHORT_SHA" \
  '{
    username: $username,
    content: $content,
    embeds: [{
      color: $color,
      fields: [
        {name: "Branch", value: $branch, inline: true},
        {name: "Autor", value: $actor, inline: true},
        {name: "Commit", value: $sha, inline: true}
      ],
      url: $url
    }]
  }' | curl -fsS -H "Content-Type: application/json" -d @- "$DISCORD_WEBHOOK_URL"
