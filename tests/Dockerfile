FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y bash postgresql-client redis-tools coreutils && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /tests

COPY volume-test.sh .
COPY test.jpg .
COPY test.mp4 .
COPY control/test_control.jpg control/
COPY control/test_control.mp4 control/

RUN chmod +x volume-test.sh

ENTRYPOINT ["./volume-test.sh"]