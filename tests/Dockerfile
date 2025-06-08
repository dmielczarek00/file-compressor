FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y bash postgresql-client redis-tools coreutils && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /tests

COPY scripts/volume-test.sh .
COPY test/files/test.jpg .
COPY test/files/test.mp4 .
COPY test/files/control/test_control.jpg .
COPY test/files/control/test_control.mp4 .

RUN chmod +x volume-test.sh

ENTRYPOINT ["./volume-test.sh"]