FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY runner/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/python && /opt/python/bin/pip install --no-cache-dir -r /tmp/requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY --from=agy_runtime agy /usr/local/bin/agy
ARG ARTHAPALANA_AGY_SHA256=72738cf0445918483956a5f0da33abdfcfb21a12dd9a421fd57d063782826669
RUN test "$(sha256sum /usr/local/bin/agy | cut -d' ' -f1)" = "$ARTHAPALANA_AGY_SHA256"
COPY . .
RUN npm run build && node runner/build.mjs && mkdir -p /data /screening /documents /sources /home/node/.gemini/antigravity-cli && chown -R node:node /app/.runner-private /data /screening /documents /sources /home/node/.gemini
USER node
ENV HOME=/home/node PATH=/opt/python/bin:/usr/local/bin:/usr/bin:/bin ARTHAPALANA_LOCAL=1 ARTHAPALANA_PYTHON=/opt/python/bin/python WRANGLER_SEND_METRICS=false
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["web"]
