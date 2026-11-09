package com.jjaklog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** News and events go to metamoa with the space key; the key never reaches the browser. A fake metamoa answers. */
@SpringBootTest(properties = {"jjaklog.admin.handles=mm_boss", "jjaklog.metamoa.key=mm_live_test", "jjaklog.metamoa.space-id=angpark"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MetamoaAdminTest {

    static final List<String> calls = new CopyOnWriteArrayList<>();
    static final HttpServer fake;

    static {
        try {
            fake = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        fake.createContext("/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            calls.add(ex.getRequestMethod() + " " + ex.getRequestURI() + " " + ex.getRequestHeaders().getFirst("Authorization") + " " + body);
            String path = ex.getRequestURI().getPath();
            int code;
            String out;
            if (path.equals("/api/update/angpark")) {
                boolean again = calls.stream().filter(c -> c.startsWith("POST /api/update")).count() > 1;
                code = again ? 429 : 201;
                out = again ? "{\"error\":\"too_soon\",\"retry_after\":86000}" : "{\"ok\":true,\"shown_until\":\"2026-11-17T00:00:00Z\"}";
            } else if (path.endsWith("/events") && ex.getRequestMethod().equals("GET")) {
                code = 200;
                out = "{\"events\":[{\"id\":\"ev_1\",\"title\":\"밤 산책\"}]}";
            } else if (path.endsWith("/events")) {
                code = 201;
                out = "{\"event\":{\"id\":\"ev_2\"}}";
            } else {
                code = 200;
                out = "{\"ok\":true}";
            }
            byte[] b = out.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(code, b.length);
            ex.getResponseBody().write(b);
            ex.close();
        });
        fake.start();
    }

    @DynamicPropertySource
    static void base(DynamicPropertyRegistry r) {
        r.add("jjaklog.metamoa.base", () -> "http://127.0.0.1:" + fake.getAddress().getPort());
    }

    @AfterAll
    static void stop() {
        fake.stop(0);
    }

    @Autowired
    MockMvc mvc;

    @Test
    void newsAndEventsGoThroughTheServer() throws Exception {
        MockHttpSession boss = login("mm_boss");
        MockHttpSession other = login("mm_other");
        mvc.perform(post("/api/admin/metamoa/update").session(other).contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"x\"}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/metamoa").session(boss)).andExpect(jsonPath("$.enabled").value(true));

        mvc.perform(post("/api/admin/metamoa/update").session(boss).contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"1\\n2\\n3\\n4\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/metamoa/update").session(boss).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"장난치기가 생겼어요\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
        mvc.perform(post("/api/admin/metamoa/update").session(boss).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"또\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.message").value("메타모아가 받지 않았어요(429, too_soon)."));

        mvc.perform(get("/api/admin/metamoa/events").session(boss)).andExpect(jsonPath("$.events[0].id").value("ev_1"));
        mvc.perform(post("/api/admin/metamoa/events").session(boss).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"밤 산책\",\"starts_at\":\"2026-11-20T21:00:00+09:00\",\"ends_at\":\"2026-11-20T22:00:00+09:00\"}"))
                .andExpect(jsonPath("$.event.id").value("ev_2"));
        mvc.perform(delete("/api/admin/metamoa/events/{id}", "ev_2").session(boss)).andExpect(jsonPath("$.ok").value(true));
        mvc.perform(delete("/api/admin/metamoa/events/{id}", "..%2Fx").session(boss)).andExpect(status().is4xxClientError());

        assertThat(calls).allMatch(c -> c.contains(" Bearer mm_live_test "));
        assertThat(calls).anyMatch(c -> c.startsWith("DELETE /api/space/angpark/events/ev_2"));
    }

    private MockHttpSession login(String handle) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/dev-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"" + handle + "\",\"nickname\":\"" + handle + "\"}"))
                .andExpect(status().isOk()).andReturn();
        return (MockHttpSession) r.getRequest().getSession(false);
    }
}
