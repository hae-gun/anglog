package com.anglog.realtime.admin;

import com.anglog.realtime.park.Channels;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Tells metamoa.com (a Korean list of web metaverses) how many birds are in 앵파크 right now, every
 * 10 minutes (their rule: not again within 9 minutes). Only the count, nothing about anyone.
 * Off until METAMOA_KEY and METAMOA_SPACE_ID are set. Runs on its own thread so a slow answer from
 * metamoa can never hold up the 200ms presence broadcasts.
 */
@Component
public class MetamoaLive {

    private static final Logger log = LoggerFactory.getLogger(MetamoaLive.class);
    private static final long EVERY_MINUTES = 10;

    private final Channels channels;
    private final String key;
    private final URI uri;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ScheduledExecutorService timer;

    public MetamoaLive(Channels channels,
                       @Value("${metamoa.key:}") String key,
                       @Value("${metamoa.space-id:}") String spaceId,
                       @Value("${metamoa.base:https://metamoa.com}") String base) {
        this.channels = channels;
        this.key = key == null ? "" : key.trim();
        String space = spaceId == null ? "" : spaceId.trim();
        boolean on = !this.key.isEmpty() && space.matches("[A-Za-z0-9_-]{1,80}");
        this.uri = on ? URI.create(base.replaceAll("/$", "") + "/api/live/" + space) : null;
        if (on) {
            timer = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "metamoa-live");
                t.setDaemon(true);
                return t;
            });
            // first report a minute after start (a restart right after another must not trip the 9 minute rule)
            timer.scheduleWithFixedDelay(this::report, 1, EVERY_MINUTES, TimeUnit.MINUTES);
            log.info("metamoa: reporting the park's online count every {} minutes", EVERY_MINUTES);
        } else {
            timer = null;
        }
    }

    void report() {
        int count = Math.max(0, Math.min(channels.total(), 100_000));
        try {
            HttpResponse<String> res = http.send(HttpRequest.newBuilder(uri)
                            .timeout(Duration.ofSeconds(10))
                            .header("Authorization", "Bearer " + key)
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString("{\"count\":" + count + "}"))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 204) {
                log.warn("metamoa: live count {} answered {} {}", count, res.statusCode(),
                        res.body().length() > 200 ? res.body().substring(0, 200) : res.body());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("metamoa: could not send the live count: {}", e.toString());
        }
    }

    @PreDestroy
    void stop() {
        if (timer != null) {
            timer.shutdownNow();
        }
    }
}
