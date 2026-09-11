#!/bin/sh
# Официальный образ nginx сам запускает всё исполняемое из /docker-entrypoint.d/
# по алфавиту перед стартом - см. Dockerfile.
set -e

CERT_DIR=/etc/nginx/certs

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  echo "[nginx] Сертификат не найден - генерирую самоподписанный для локальной разработки."
  echo "[nginx] Для прода смонтируйте настоящие (Let's Encrypt и т.п.) в $CERT_DIR - fullchain.pem/privkey.pem."
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=localhost" \
    2>/dev/null
fi
