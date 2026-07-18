#!/usr/bin/env bash

set -u
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="${OPENCODE_CONFIG_PATH:-$ROOT_DIR/.opencode/opencode.json}"
IMAGE_PATH="${1:-}"

if [[ -z "$IMAGE_PATH" || ! -f "$IMAGE_PATH" ]]; then
  echo "Usage: $0 /absolute/path/to/image" >&2
  exit 1
fi

for required_command in curl jq file base64 tr mktemp; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

OPENROUTER_API_KEY="$(jq -er '.mcp.openrouter_image.environment.OPENROUTER_API_KEY' "$CONFIG_PATH")" || {
  echo "OPENROUTER_API_KEY was not found in $CONFIG_PATH" >&2
  exit 1
}

MIME_TYPE="$(file --brief --mime-type "$IMAGE_PATH")"
BASE64_FILE="$(mktemp)"
PAYLOAD_FILE="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$BASE64_FILE" "$PAYLOAD_FILE" "$RESPONSE_FILE"' EXIT

base64 <"$IMAGE_PATH" | tr -d '\n' >"$BASE64_FILE"

DEFAULT_MODELS=(
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
  "google/gemma-4-26b-a4b-it:free"
  "google/gemma-4-31b-it:free"
  "nvidia/nemotron-nano-12b-v2-vl:free"
)

if [[ $# -gt 1 ]]; then
  MODELS=("${@:2}")
else
  MODELS=("${DEFAULT_MODELS[@]}")
fi

echo "Image: $IMAGE_PATH ($MIME_TYPE)"
echo

for model in "${MODELS[@]}"; do
  jq -n \
    --arg model "$model" \
    --arg mime_type "$MIME_TYPE" \
    --rawfile image_data "$BASE64_FILE" \
    '{
      model: $model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Briefly describe this image and transcribe any visible text." },
          { type: "image_url", image_url: { url: ("data:" + $mime_type + ";base64," + $image_data) } }
        ]
      }],
      max_tokens: 250,
      temperature: 0.1
    }' >"$PAYLOAD_FILE"

  curl_metrics="$(curl \
    --silent \
    --show-error \
    --max-time 75 \
    --output "$RESPONSE_FILE" \
    --write-out $'%{http_code}\t%{time_total}' \
    --request POST \
    --header "Authorization: Bearer $OPENROUTER_API_KEY" \
    --header "Content-Type: application/json" \
    --data-binary "@$PAYLOAD_FILE" \
    "https://openrouter.ai/api/v1/chat/completions")"
  curl_status=$?
  IFS=$'\t' read -r http_code elapsed_seconds <<<"$curl_metrics"

  echo "[$model] ${elapsed_seconds}s HTTP $http_code"

  if [[ $curl_status -ne 0 ]]; then
    echo "  curl failed with exit code $curl_status"
  elif [[ "$http_code" == "200" ]]; then
    jq -r '
      "  resolved model: " + (.model // "unknown"),
      "  response: " + ((.choices[0].message.content // "empty response") | tostring | gsub("[\\r\\n]+"; " ") | .[0:500])
    ' "$RESPONSE_FILE"
  else
    jq -r '"  error: " + (.error.message // .message // "unknown error")' "$RESPONSE_FILE"
  fi

  echo
done
