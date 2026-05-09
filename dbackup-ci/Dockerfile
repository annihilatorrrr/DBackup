FROM ubuntu:24.04

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    curl \
    jq \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY ./execute.sh /backup/execute.sh
RUN chmod +x /backup/execute.sh
