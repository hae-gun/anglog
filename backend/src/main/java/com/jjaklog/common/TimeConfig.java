package com.jjaklog.common;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TimeConfig {

    /** Injected everywhere "now" is needed, so tests can pin the date. */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
