package com.jjaklog.common;

import java.time.ZoneId;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jjaklog")
public record JjaklogProperties(Auth auth, Storage storage, String zone) {

    public record Auth(boolean devLoginEnabled) {
    }

    public record Storage(String dir) {
    }

    public ZoneId zoneId() {
        return ZoneId.of(zone == null ? "Asia/Seoul" : zone);
    }
}
