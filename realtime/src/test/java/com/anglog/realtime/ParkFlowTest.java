package com.anglog.realtime;

import static com.anglog.realtime.TestClient.has;
import static org.assertj.core.api.Assertions.assertThat;

import com.anglog.realtime.session.SessionRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.socket.CloseStatus;

/** End to end over real WebSockets: two birds see each other join, move, talk and leave. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"angpark.max-connections-per-ip=100", "angpark.say-min-gap-ms=0", "angpark.emote-min-gap-ms=0"})
class ParkFlowTest {

    @LocalServerPort
    int port;

    @Autowired
    SessionRegistry registry;

    @BeforeEach
    void waitForCleanState() throws InterruptedException {
        // the previous test's sockets close asynchronously; their late leaves must not leak in
        long deadline = System.currentTimeMillis() + 5_000;
        while (registry.size() > 0 && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }

    @Test
    void twoBirdsSeeEachOther() throws Exception {
        try (TestClient a = TestClient.connect(port); TestClient b = TestClient.connect(port)) {
            JsonNode wa = a.hello("머란이");
            int pidA = wa.path("pid").asInt();
            assertThat(pidA).isPositive();
            assertThat(wa.path("channel").asInt()).isEqualTo(1);
            assertThat(wa.path("players")).isEmpty();

            JsonNode wb = b.hello("보리");
            int pidB = wb.path("pid").asInt();
            // B's welcome already lists A, with A's look
            assertThat(has(wb, "players", p -> p.path("pid").asInt() == pidA
                    && p.path("look").path("name").asText().equals("머란이")
                    && p.path("look").path("colors").path("body").asText().equals("#5DBB4A"))).isTrue();
            assertThat(wb.path("online").asInt()).isEqualTo(2);

            // A hears that B joined
            a.await("presence", m -> has(m, "joined", p -> p.path("pid").asInt() == pidB));

            // moves are batched and reach the other side
            a.send("{\"type\":\"move\",\"x\":5.123,\"y\":0,\"z\":7,\"ry\":1.5,\"m\":1}");
            b.await("presence", m -> has(m, "moved", r -> r.get(0).asInt() == pidA
                    && r.get(1).asDouble() == 5.12 && r.get(3).asDouble() == 7.0 && r.get(5).asInt() == 1));

            // fixed phrases and emotes
            b.send("{\"type\":\"say\",\"n\":3}");
            a.await("presence", m -> has(m, "says", s -> s.get(0).asInt() == pidB && s.get(1).asInt() == 3));
            b.send("{\"type\":\"emote\",\"id\":\"dance\"}");
            a.await("presence", m -> has(m, "emotes", e -> e.get(0).asInt() == pidB && e.get(1).asText().equals("dance")));

            // a new look reaches the others
            b.send("{\"type\":\"look\",\"look\":{\"name\":\"보리2\",\"species\":\"QUAKER\",\"colors\":{\"body\":\"#7DBB5A\"}}}");
            a.await("presence", m -> has(m, "looks", l -> l.path("pid").asInt() == pidB
                    && l.path("look").path("name").asText().equals("보리2")
                    && l.path("look").path("species").asText().equals("QUAKER")));

            // leaving is announced
            b.close();
            a.await("presence", m -> has(m, "left", pid -> pid.asInt() == pidB));
        }
    }

    @Test
    void unknownPhrasesAndEmotesAreDropped() throws Exception {
        try (TestClient a = TestClient.connect(port); TestClient b = TestClient.connect(port)) {
            a.hello("하루");
            JsonNode wb = b.hello("콩이");
            int pidB = wb.path("pid").asInt();
            b.send("{\"type\":\"say\",\"n\":99}");
            b.send("{\"type\":\"say\",\"n\":\"1\"}");
            b.send("{\"type\":\"emote\",\"id\":\"<script>\"}");
            assertThat(a.never("presence", m -> has(m, "says", s -> s.get(0).asInt() == pidB)
                    || has(m, "emotes", e -> e.get(0).asInt() == pidB), 800)).isTrue();
        }
    }

    @Test
    void badLooksAreCleanedUp() throws Exception {
        try (TestClient a = TestClient.connect(port); TestClient b = TestClient.connect(port)) {
            a.send("{\"type\":\"hello\",\"v\":1,\"x\":999,\"y\":-5,\"z\":\"no\",\"look\":{\"name\":\"\\u0000아주아주아주아주긴이름입니다요\","
                    + "\"species\":\"DRAGON\",\"colors\":{\"body\":\"red\"},\"home\":\"../admin\"}}");
            int pidA = a.await("welcome").path("pid").asInt();
            JsonNode wb = b.hello("보리");
            JsonNode seen = null;
            for (JsonNode p : wb.path("players")) {
                if (p.path("pid").asInt() == pidA) {
                    seen = p;
                }
            }
            assertThat(seen).isNotNull();
            assertThat(seen.path("look").path("name").asText()).isEqualTo("아주아주아주아주긴이름입");
            assertThat(seen.path("look").path("species").asText()).isEqualTo("OTHER");
            assertThat(seen.path("look").path("colors").path("body").asText()).isEqualTo("#9BC9A0");
            assertThat(seen.path("look").path("home").isNull()).isTrue();
            // a position that is not a number puts the bird at the gate
            assertThat(seen.path("z").asDouble()).isEqualTo(23.0);
        }
    }

    @Test
    void wrongVersionIsClosed() throws Exception {
        try (TestClient a = TestClient.connect(port)) {
            a.send("{\"type\":\"hello\",\"v\":99}");
            CloseStatus status = a.awaitClose();
            assertThat(status).isNotNull();
            assertThat(status.getCode()).isEqualTo(4001);
        }
    }

    @Test
    void nothingBeforeHello() throws Exception {
        try (TestClient a = TestClient.connect(port)) {
            a.send("{\"type\":\"move\",\"x\":1,\"y\":0,\"z\":1}");
            assertThat(a.await("error").path("code").asText()).isEqualTo("NOT_READY");
            a.send("{\"type\":\"ping\",\"t\":42}");
            assertThat(a.await("error", m -> true)).isNotNull();
        }
    }
}
