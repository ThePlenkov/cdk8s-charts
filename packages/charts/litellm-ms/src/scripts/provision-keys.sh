#!/usr/bin/env sh
set -eu

: "${LITELLM_BASE_URL:?LITELLM_BASE_URL is required}"
: "${LITELLM_MASTER_KEY:?LITELLM_MASTER_KEY is required}"
: "${LITELLM_KEY_SPECS:?LITELLM_KEY_SPECS is required}"

key_dir="${LITELLM_KEY_DIR:-/keys}"
tab="$(printf '\t')"

response_file=""
cleanup_response() { [ -n "${response_file}" ] && rm -f "${response_file}"; }
trap cleanup_response EXIT

printf '%s\n' "${LITELLM_KEY_SPECS}" | while IFS="${tab}" read -r alias file_name; do
  [ -n "${alias}" ] || continue
  payload_file="${key_dir}/${file_name}"

  echo "Provisioning key: ${alias}"
  response_file="$(mktemp)"
  http_code="$(
    curl -sS -o "${response_file}" -w "%{http_code}" --max-time 30 --connect-timeout 10 -X POST "${LITELLM_BASE_URL}/key/generate" \
      -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
      -H "Content-Type: application/json" \
      --data-binary "@${payload_file}"
  )"
  body="$(cat "${response_file}")"
  rm -f "${response_file}"

  if [ "${http_code}" -ge 200 ] && [ "${http_code}" -lt 300 ]; then
    echo "Key ${alias} provisioned successfully"
  elif [ "${http_code}" -eq 400 ] && printf '%s' "${body}" | grep -qi "already exists"; then
    echo "Key ${alias} already exists — skipping"
  else
    echo "ERROR: Failed to provision key ${alias} (HTTP ${http_code})" >&2
    [ -n "${LITELLM_DEBUG:-}" ] && echo "${body}" >&2
    exit 1
  fi

  echo "---"
done
