package com.anglog.realtime;

import com.anglog.realtime.config.ParkProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 앵파크 realtime server: plain WebSocket on /ws, everything kept in memory. */
@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(ParkProperties.class)
public class RealtimeApplication {

    public static void main(String[] args) {
        SpringApplication.run(RealtimeApplication.class, args);
    }
}
