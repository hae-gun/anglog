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
 * metamoa.com, a Korean list of web metaverses where 앵파크 is listed. The admin page posts news
 * (once a day) and events through here; the key (METAMOA_KEY) stays on the server.
 * The live count goes from the realtime server (com.anglog.realtime.admin.MetamoaLive).
 */
@Component
public class Metamoa {

    private final String base;
    private final String key;
    private final String space;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public Metamoa(@Value("${jjaklog.metamoa.base:https://metamoa.com}") String base,
                   @Value("${jjaklog.metamoa.key:}") String key,
                   @Value("${jjaklog.metamoa.space-id:}") String space,
                   ObjectMapper json) {
        this.base = base.replaceAll("/$", "");
        this.key = key == null ? "" : key.trim();
        this.space = space == null ? "" : space.trim();
        this.json = json;
    }

    public boolean enabled() {
        return !key.isEmpty() && space.matches("[A-Za-z0-9_-]{1,80}");
    }

    public String spaceId() {
        return space;
    }

    public JsonNode postUpdate(String text) {
        return call("POST", "/api/update/" + space, json.createObjectNode().put("text", text).toString());
    }

    public JsonNode events() {
        return call("GET", "/api/space/" + space + "/events", null);
    }

    public JsonNode addEvent(JsonNode event) {
        return call("POST", "/api/space/" + space + "/events", event.toString());
    }

    public JsonNode deleteEvent(String eventId) {
        if (!eventId.matches("[A-Za-z0-9_-]{1,80}")) {
            throw ApiException.badRequest("BAD_EVENT_ID", "이벤트 번호가 이상해요.");
        }
        return call("DELETE", "/api/space/" + space + "/events/" + eventId, null);
    }

    private JsonNode call(String method, String path, String body) {
        if (!enabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "METAMOA_OFF",
                    "메타모아 키가 아직 없어요. 승인과 소유자 확인 뒤 infra/.env에 METAMOA_KEY와 METAMOA_SPACE_ID를 넣어 주세요.");
        }
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(base + path))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", "Bearer " + key);
        if (body != null) {
            req.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(body));
        } else {
            req.method(method, HttpRequest.BodyPublishers.noBody());
        }
        HttpResponse<String> res;
        try {
            res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unreachable();
        } catch (Exception e) {
            throw unreachable();
        }
        JsonNode out;
        try {
            out = res.body() == null || res.body().isBlank() ? json.createObjectNode() : json.readTree(res.body());
        } catch (Exception e) {
            out = json.createObjectNode().put("raw", res.body().length() > 300 ? res.body().substring(0, 300) : res.body());
        }
        if (res.statusCode() / 100 != 2) {
            // their reason, as they wrote it, so the admin sees why (too_soon, duplicate, ...)
            String why = firstText(out, "message", "error", "code", "raw");
            throw new ApiException(res.statusCode() == 429 ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_GATEWAY,
                    "METAMOA_" + res.statusCode(), "메타모아가 받지 않았어요(" + res.statusCode() + (why == null ? "" : ", " + why) + ").");
        }
        return out;
    }

    private static String firstText(JsonNode n, String... fields) {
        for (String f : fields) {
            if (n.hasNonNull(f) && !n.get(f).asText().isBlank()) {
                return n.get(f).asText();
            }
        }
        return null;
    }

    private static ApiException unreachable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "METAMOA_UNREACHABLE", "메타모아에 닿지 않아요. 잠시 뒤 다시 해 주세요.");
    }
}
