#!/bin/sh
set -eu

tenant_id="${HATCHET_TENANT_ID:-707d0855-80ab-4e1f-a156-f1c4546cbf52}"
token_file="${HATCHET_TOKEN_FILE:-/hatchet-token/hatchet_client_token}"
database_host="${HATCHET_DATABASE_HOST:-hatchet-postgres}"
database_port="${HATCHET_DATABASE_PORT:-5432}"
admin_config_dir=/tmp/hatchet-token-config

mkdir -p "$(dirname "$token_file")"

if [ ! -s "$token_file" ]; then
  rm -rf "$admin_config_dir"
  cp -R /config "$admin_config_dir"
  sed -i "s/^host: .*/host: ${database_host}/" "$admin_config_dir/database.yaml"
  sed -i "s/^port: .*/port: ${database_port}/" "$admin_config_dir/database.yaml"

  token=$(
    /hatchet-admin token create \
      --config "$admin_config_dir" \
      --tenant-id "$tenant_id" \
      --name kordo-local-compose \
      --expiresIn 87600h |
      sed -n "1p"
  )

  if [ -z "$token" ]; then
    echo "Hatchet token generation returned an empty token." >&2
    exit 1
  fi

  temp_file="${token_file}.tmp"
  printf "%s" "$token" > "$temp_file"
  chmod 0400 "$temp_file"
  mv "$temp_file" "$token_file"
fi
