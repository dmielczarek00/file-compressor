FROM ubuntu:22.04

RUN apk update && apk add --no-cache \
    bash \
    postgresql-client \
    redis \
    ca-certificates \
    curl \

WORKDIR /tests

COPY volume-test.sh .

RUN chmod +x volume-test.sh

ENTRYPOINT ["./volume-test.sh"]