package com.jjaklog.common;

import java.time.ZoneId;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jjaklog")
public record JjaklogProperties(Auth auth, Storage storage, String zone, Cors cors) {

    public record Auth(boolean devLoginEnabled) {
    }

    public record Storage(String dir) {
    }

    /** Sites allowed to call /api with cookies (the screen is on GitHub Pages, the API on the server). */
    public record Cors(List<String> allowedOrigins) {
    }

    public ZoneId zoneId() {
        return ZoneId.of(zone == null ? "Asia/Seoul" : zone);
    }
}
