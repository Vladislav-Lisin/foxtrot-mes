FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.d/50-self-signed-cert.sh /docker-entrypoint.d/50-self-signed-cert.sh
RUN chmod +x /docker-entrypoint.d/50-self-signed-cert.sh

EXPOSE 80 443 8443
