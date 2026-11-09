package com.jjaklog;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Password accounts, and the development login switched off as in production. */
@SpringBootTest(properties = {
        "jjaklog.auth.dev-login-enabled=false",
        "jjaklog.cors.allowed-origins=https://anglog.example"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthFlowTest {

    @Autowired
    MockMvc mvc;

    private static String body(String handle, String nickname, String password) {
        return "{\"handle\":\"" + handle + "\",\"nickname\":\"" + nickname + "\",\"password\":\"" + password + "\"}";
    }

    @Test
    void signUpLoginAndLogout() throws Exception {
        MockHttpSession s = new MockHttpSession();
        mvc.perform(post("/api/auth/signup").session(s).contentType(MediaType.APPLICATION_JSON)
                        .content(body("Pomi_Home", "뽀미네", "seed-and-millet")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("pomi_home"));

        // the same handle cannot be taken twice
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(body("pomi_home", "가짜", "another-pass")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("HANDLE_TAKEN"));

        // wrong password and unknown handle look the same
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"pomi_home\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"nobody_here\",\"password\":\"seed-and-millet\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"));

        MockHttpSession again = new MockHttpSession();
        mvc.perform(post("/api/auth/login").session(again).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"POMI_HOME\",\"password\":\"seed-and-millet\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("뽀미네"));
    }

    @Test
    void weakInputIsRefused() throws Exception {
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(body("short_pw", "짧음", "1234567")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(body("same_as_id", "같음", "same_as_id")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(body("Bad Handle!", "이상함", "good-password")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_HANDLE"));
    }

    @Test
    void guessingIsSlowedDown() throws Exception {
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body("guess_me", "맞혀봐", "right-password"))).andExpect(status().isOk());
        for (int i = 0; i < 8; i++) {
            mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"handle\":\"guess_me\",\"password\":\"wrong-" + i + "\"}"))
                    .andExpect(status().isUnauthorized());
        }
        // even the right password waits now
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"guess_me\",\"password\":\"right-password\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
    }

    @Test
    void developmentLoginIsOff() throws Exception {
        mvc.perform(post("/api/auth/dev-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"anyone\",\"nickname\":\"누구나\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me")).andExpect(status().isNoContent());
    }

    /** The screen lives on another origin (GitHub Pages); only that origin may call with cookies. */
    @Test
    void onlyTheScreenOriginMayCallWithCookies() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "https://anglog.example")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://anglog.example"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));

        mvc.perform(options("/api/auth/login")
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/auth/me").header("Origin", "https://anglog.example"))
                .andExpect(header().string("Access-Control-Allow-Origin", "https://anglog.example"));
    }
}
