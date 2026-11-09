package com.jjaklog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** The token the 앵파크 realtime server checks to keep one bird per account. */
@SpringBootTest(properties = "jjaklog.park.token-secret=park-test-secret")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ParkTokenTest {

    @Autowired
    MockMvc mvc;

    @Test
    void onlyLoggedInOwnersGetASignedToken() throws Exception {
        mvc.perform(post("/api/park/token")).andExpect(status().isUnauthorized());

        MockHttpSession s = new MockHttpSession();
        mvc.perform(post("/api/auth/dev-login").session(s).contentType(MediaType.APPLICATION_JSON)
                .content("{\"handle\":\"park_owner\",\"nickname\":\"공원집\"}")).andExpect(status().isOk());
        String json = mvc.perform(post("/api/park/token").session(s))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expiresInSec").value(300))
                .andReturn().getResponse().getContentAsString();
        String token = new ObjectMapper().readTree(json).path("token").asText();

        // the same check the realtime server does
        int dot = token.lastIndexOf('.');
        String signed = token.substring(0, dot);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("park-test-secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(signed.getBytes(StandardCharsets.UTF_8)));
        assertThat(token.substring(dot + 1)).isEqualTo(sig);
        String payload = new String(Base64.getUrlDecoder().decode(signed.substring(3)), StandardCharsets.UTF_8);
        assertThat(payload.split(":")[1]).isEqualTo("park_owner");
    }
}
