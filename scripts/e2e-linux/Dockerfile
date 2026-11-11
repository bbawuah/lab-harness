FROM amd64/ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl unzip ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -d /lab/home -s /bin/bash tester \
    && mkdir -p /lab/home /lab/source /lab/results /lab/fixture \
    && chown -R tester:tester /lab
COPY smoke.py install.py diagnose.py /lab/test/
USER tester
ENV HOME=/lab/home PYTHONDONTWRITEBYTECODE=1
WORKDIR /lab/source
CMD ["sleep", "infinity"]
