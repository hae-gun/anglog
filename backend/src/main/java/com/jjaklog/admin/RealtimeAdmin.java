package com.jjaklog.admin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jjaklog.common.ApiException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Talks to the 앵파크 realtime server's /internal endpoints (inside the docker network only; the
 * proxy never forwards /internal). Uses the park token secret as the key, so no new secret to keep.
 */
@Component
public class RealtimeAdmin {

    private final String base;
    private final String key;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    public RealtimeAdmin(@Value("${jjaklog.park.realtime-url:http://localhost:8090}") String base,
                         @Value("${jjaklog.park.token-secret:}") String key, ObjectMapper json) {
        this.base = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        this.key = key;
        this.json = json;
    }

    public JsonNode state() {
        return call(HttpRequest.newBuilder(URI.create(base + "/internal/park")).GET());
    }

    public JsonNode kick(int channel, int pid, int minutes) {
        String body = json.createObjectNode().put("channel", channel).put("pid", pid).put("minutes", minutes).toString();
        return call(HttpRequest.newBuilder(URI.create(base + "/internal/park/kick"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)));
    }

    private JsonNode call(HttpRequest.Builder req) {
        try {
            HttpResponse<String> res = http.send(req.header("X-Admin-Key", key).timeout(Duration.ofSeconds(3)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 404) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "그 앵무는 이미 공원에 없어요.");
            }
            if (res.statusCode() / 100 != 2) {
                throw unreachable();
            }
            return json.readTree(res.body());
        } catch (ApiException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unreachable();
        } catch (Exception e) {
            throw unreachable();
        }
    }

    private static ApiException unreachable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PARK_UNREACHABLE", "앵파크 서버에 닿지 않아요.");
    }
}
