package com.anglog.realtime;

import static com.anglog.realtime.TestClient.has;
import static org.assertj.core.api.Assertions.assertThat;

import com.anglog.realtime.protocol.CloseCodes;
import com.anglog.realtime.session.ParkTokens;
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
        properties = {"angpark.max-connections-per-ip=100", "angpark.say-min-gap-ms=0", "angpark.emote-min-gap-ms=0",
                "angpark.prank-min-gap-ms=0", "angpark.token-secret=flow-secret"})
class ParkFlowTest {

    @LocalServerPort
    int port;

    @Autowired
    SessionRegistry registry;

    @org.springframework.beans.factory.annotation.Autowired
    com.anglog.realtime.admin.ParkWatch watch;

    @BeforeEach
    void waitForCleanState() throws InterruptedException {
        watch.unbanAll();
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
    void birdsPrankEachOtherAndAnswer() throws Exception {
        try (TestClient a = TestClient.connect(port); TestClient b = TestClient.connect(port)) {
            int pidA = a.hello("머란이").path("pid").asInt();
            JsonNode wb = b.hello("보리");
            int pidB = wb.path("pid").asInt();
            // everyone starts at the gate, so they are close enough
            a.send("{\"type\":\"prank\",\"to\":" + pidB + ",\"k\":0}");
            b.await("presence", m -> has(m, "pranks", p -> p.get(0).asInt() == pidA && p.get(1).asInt() == pidB && p.get(2).asInt() == 0));

            b.send("{\"type\":\"answer\",\"to\":" + pidA + ",\"a\":0}");
            a.await("presence", m -> has(m, "answers", x -> x.get(0).asInt() == pidB && x.get(1).asInt() == pidA && x.get(2).asInt() == 0));

            // a bird that does not take pranks: the prankster alone hears why
            b.send("{\"type\":\"calm\",\"on\":true}");
            a.await("presence", m -> has(m, "calms", x -> x.get(0).asInt() == pidB && x.get(1).asInt() == 1));
            a.send("{\"type\":\"prank\",\"to\":" + pidB + ",\"k\":1}");
            JsonNode no = a.await("prankNo");
            assertThat(no.path("to").asInt()).isEqualTo(pidB);
            assertThat(no.path("why").asText()).isEqualTo("calm");
        }
    }

    @Test
    void calmBirdsSayItInTheirHello() throws Exception {
        try (TestClient a = TestClient.connect(port); TestClient b = TestClient.connect(port)) {
            a.send("{\"type\":\"hello\",\"v\":1,\"calm\":true,\"look\":{\"name\":\"조용이\"}}");
            int pidA = a.await("welcome").path("pid").asInt();
            JsonNode wb = b.hello("보리");
            assertThat(has(wb, "players", p -> p.path("pid").asInt() == pidA && p.path("calm").asBoolean())).isTrue();
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

    private static String token(long userId, String handle) {
        return new ParkTokens("flow-secret").issue(userId, handle, System.currentTimeMillis() / 1000 + 300);
    }

    @Test
    void sameOwnerElsewhereReplacesTheOldBirdAtItsSpot() throws Exception {
        try (TestClient watcher = TestClient.connect(port); TestClient first = TestClient.connect(port);
             TestClient second = TestClient.connect(port)) {
            watcher.hello("구경꾼");
            JsonNode w1 = first.helloAs("머란이", token(41, "meoran"), 0, 23);
            int pid1 = w1.path("pid").asInt();
            assertThat(w1.path("owner").asBoolean()).isTrue();
            assertThat(w1.has("spot")).isFalse();
            first.send("{\"type\":\"move\",\"x\":-6.5,\"y\":1.2,\"z\":4,\"ry\":2,\"m\":0}");
            watcher.await("presence", m -> has(m, "moved", r -> r.get(0).asInt() == pid1 && r.get(1).asDouble() == -6.5));

            // the same account comes in from another tab, standing at the gate
            JsonNode w2 = second.helloAs("머란이", token(41, "meoran"), 0, 23);
            int pid2 = w2.path("pid").asInt();
            assertThat(w2.path("spot").path("x").asDouble()).isEqualTo(-6.5);
            assertThat(w2.path("spot").path("z").asDouble()).isEqualTo(4.0);

            // the old tab is told and closed, and does not count as a second bird
            first.await("replaced");
            assertThat(first.awaitClose().getCode()).isEqualTo(CloseCodes.REPLACED.getCode());
            watcher.await("presence", m -> has(m, "left", p -> p.asInt() == pid1));
            watcher.await("presence", m -> has(m, "joined", p -> p.path("pid").asInt() == pid2
                    && p.path("x").asDouble() == -6.5 && p.path("look").path("home").asText().equals("meoran")));
        }
    }

    @Test
    void ownerComesBackWhereTheyLeft() throws Exception {
        try (TestClient first = TestClient.connect(port)) {
            int pid = first.helloAs("보리", token(42, "bori"), 0, 23).path("pid").asInt();
            first.send("{\"type\":\"move\",\"x\":3,\"y\":0,\"z\":-8,\"ry\":1,\"m\":0}");
            Thread.sleep(400);
        }
        waitForCleanState();
        try (TestClient again = TestClient.connect(port); TestClient guest = TestClient.connect(port)) {
            JsonNode w = again.helloAs("보리", token(42, "bori"), 0, 23);
            assertThat(w.path("spot").path("z").asDouble()).isEqualTo(-8.0);
            // a guest cannot claim a house by typing it, nor with a broken token
            JsonNode g = guest.helloAs("가짜", "v1.bm9wZQ.AAAA", 0, 23);
            assertThat(g.path("owner").asBoolean()).isFalse();
            assertThat(has(g, "players", p -> p.path("look").path("home").asText("").equals("bori"))).isTrue();
        }
    }

    private java.net.http.HttpResponse<String> internal(String path, String body, String key) throws Exception {
        java.net.http.HttpRequest.Builder b = java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://localhost:" + port + path));
        if (key != null) {
            b.header("X-Admin-Key", key);
        }
        if (body != null) {
            b.header("Content-Type", "application/json").POST(java.net.http.HttpRequest.BodyPublishers.ofString(body));
        }
        return java.net.http.HttpClient.newHttpClient().send(b.build(), java.net.http.HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void adminSeesTheParkAndCanSendABirdOut() throws Exception {
        try (TestClient bad = TestClient.connect(port)) {
            int pid = bad.hello("나쁜이름").path("pid").asInt();
            assertThat(internal("/internal/park", null, null).statusCode()).isEqualTo(403);
            assertThat(internal("/internal/park", null, "wrong").statusCode()).isEqualTo(403);

            java.net.http.HttpResponse<String> state = internal("/internal/park", null, "flow-secret");
            assertThat(state.statusCode()).isEqualTo(200);
            JsonNode s = new com.fasterxml.jackson.databind.ObjectMapper().readTree(state.body());
            assertThat(s.path("online").asInt()).isEqualTo(1);
            assertThat(s.path("today").path("hellos").asLong()).isGreaterThanOrEqualTo(1);
            JsonNode bird = s.path("channels").get(0).path("birds").get(0);
            assertThat(bird.path("name").asText()).isEqualTo("나쁜이름");
            assertThat(bird.path("addr").asText()).hasSize(8);
            int channel = s.path("channels").get(0).path("no").asInt();

            assertThat(internal("/internal/park/kick", "{\"channel\":" + channel + ",\"pid\":9999,\"minutes\":5}", "flow-secret")
                    .statusCode()).isEqualTo(404);
            assertThat(internal("/internal/park/kick", "{\"channel\":" + channel + ",\"pid\":" + pid + ",\"minutes\":5}", "flow-secret")
                    .statusCode()).isEqualTo(200);
            bad.await("kicked");
            assertThat(bad.awaitClose().getCode()).isEqualTo(CloseCodes.KICKED.getCode());
        }
        // the same address is kept out for now
        try (TestClient again = TestClient.connect(port)) {
            assertThat(again.awaitClose().getCode()).isEqualTo(CloseCodes.KICKED.getCode());
        }
    }
}
