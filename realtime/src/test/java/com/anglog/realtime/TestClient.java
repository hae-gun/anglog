package com.anglog.realtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Minimal protocol client for tests. Every received message is kept, and await() searches the
 * whole history, so a message that arrived while waiting for another one is never lost.
 */
final class TestClient implements AutoCloseable {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final List<JsonNode> received = new CopyOnWriteArrayList<>();
    private volatile WebSocketSession session;
    private volatile CloseStatus closeStatus;

    static TestClient connect(int port) throws Exception {
        TestClient client = new TestClient();
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setOrigin("http://localhost:5173");
        client.session = new StandardWebSocketClient()
                .execute(new TextWebSocketHandler() {
                    @Override
                    protected void handleTextMessage(WebSocketSession s, TextMessage message) throws Exception {
                        client.received.add(MAPPER.readTree(message.getPayload()));
                    }

                    @Override
                    public void afterConnectionClosed(WebSocketSession s, CloseStatus status) {
                        client.closeStatus = status;
                    }
                }, headers, URI.create("ws://localhost:" + port + "/ws"))
                .get(5, TimeUnit.SECONDS);
        return client;
    }

    void send(String json) throws Exception {
        synchronized (this) {
            session.sendMessage(new TextMessage(json));
        }
    }

    /** Says hello as a lovebird with this name at the gate and waits for the welcome. */
    JsonNode hello(String name) throws Exception {
        send("{\"type\":\"hello\",\"v\":1,\"x\":0,\"y\":0,\"z\":23,\"ry\":0,\"look\":{\"name\":\"" + name
                + "\",\"species\":\"LOVEBIRD\",\"colors\":{\"face\":\"#F2784B\",\"head\":\"#E0473A\",\"body\":\"#5DBB4A\",\"wing\":\"#4A9A3B\",\"tail\":\"#4A9A3B\"}}}");
        return await("welcome");
    }

    JsonNode await(String type) throws InterruptedException {
        return await(type, m -> true);
    }

    /** Waits up to 5 s until a message of this type matching the predicate has been received. */
    JsonNode await(String type, Predicate<JsonNode> match) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (System.nanoTime() < deadline) {
            for (JsonNode m : received) {
                if (type.equals(m.path("type").asText()) && match.test(m)) {
                    return m;
                }
            }
            Thread.sleep(20);
        }
        throw new AssertionError("no '" + type + "' message within 5 s, received: " + received);
    }

    /** True if no message of this type matching the predicate arrives within the wait. */
    boolean never(String type, Predicate<JsonNode> match, long waitMs) throws InterruptedException {
        Thread.sleep(waitMs);
        return received.stream().noneMatch(m -> type.equals(m.path("type").asText()) && match.test(m));
    }

    CloseStatus awaitClose() throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (System.nanoTime() < deadline && closeStatus == null) {
            Thread.sleep(50);
        }
        return closeStatus;
    }

    @Override
    public void close() throws Exception {
        if (session.isOpen()) {
            session.close();
        }
    }

    /** Does an array field of a presence message contain an entry matching the predicate? */
    static boolean has(JsonNode presence, String field, Predicate<JsonNode> entry) {
        for (JsonNode e : presence.path(field)) {
            if (entry.test(e)) {
                return true;
            }
        }
        return false;
    }
}
