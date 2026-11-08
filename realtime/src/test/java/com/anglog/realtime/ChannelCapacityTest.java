package com.anglog.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/** A full channel sends the next bird to a new one. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"angpark.channel-capacity=2", "angpark.max-connections-per-ip=100"})
class ChannelCapacityTest {

    @LocalServerPort
    int port;

    @Test
    void thirdBirdGoesToChannelTwo() throws Exception {
        try (TestClient a = TestClient.connect(port); TestClient b = TestClient.connect(port); TestClient c = TestClient.connect(port)) {
            assertThat(a.hello("하나").path("channel").asInt()).isEqualTo(1);
            assertThat(b.hello("둘").path("channel").asInt()).isEqualTo(1);
            assertThat(c.hello("셋").path("channel").asInt()).isEqualTo(2);
        }
    }
}
