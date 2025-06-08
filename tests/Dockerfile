FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y bash postgresql-client redis-tools redis coreutils python3 openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /tests

COPY volume-test.sh .

RUN chmod +x volume-test.sh

ENTRYPOINT ["./volume-test.sh"]