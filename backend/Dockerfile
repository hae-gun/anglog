# Multi-stage: the server builds from source, nothing needs to be built on the Mac first.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
# dependencies in their own layer, so a code change does not download them again
RUN ./gradlew --no-daemon -q dependencies > /dev/null
COPY src src
RUN ./gradlew --no-daemon -q bootJar -x test && cp build/libs/*.jar /src/app.jar

FROM eclipse-temurin:21-jre
RUN groupadd -r app && useradd -r -g app -u 1001 app     && mkdir -p /data/media && chown app:app /data/media
WORKDIR /app
COPY --from=build /src/app.jar app.jar
USER app
EXPOSE 8080
# the heap takes 75% of the container memory limit set in infra/docker-compose.yml
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", "-jar", "app.jar"]
