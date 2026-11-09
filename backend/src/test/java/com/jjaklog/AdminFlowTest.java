package com.jjaklog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** The admin page: only listed handles, numbers, cleaning up, suspending. The park server is not running here. */
@SpringBootTest(properties = {"jjaklog.admin.handles=adm_boss", "jjaklog.park.realtime-url=http://localhost:1"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminFlowTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper om;

    @Test
    void onlyAdminsGetIn() throws Exception {
        MockHttpSession boss = login("adm_boss");
        MockHttpSession someone = login("adm_someone");
        mvc.perform(get("/api/admin/overview")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/overview").session(someone)).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").session(someone)).andExpect(jsonPath("$.admin").value(false));
        mvc.perform(get("/api/auth/me").session(boss)).andExpect(jsonPath("$.admin").value(true));

        JsonNode o = json(mvc.perform(get("/api/admin/overview").session(boss)).andExpect(status().isOk()).andReturn());
        assertThat(o.path("totals").path("users").asLong()).isGreaterThanOrEqualTo(2);
        assertThat(o.path("days")).hasSize(14);
        // both owners did something today
        assertThat(o.path("days").get(13).path("active").asLong()).isGreaterThanOrEqualTo(2);
        assertThat(o.path("days").get(13).path("signups").asLong()).isGreaterThanOrEqualTo(2);
        // the park server is down: the rest still shows
        assertThat(o.path("park").isNull()).isTrue();
        assertThat(o.path("parkError").asText()).isEqualTo("앵파크 서버에 닿지 않아요.");
        mvc.perform(get("/api/admin/park").session(boss)).andExpect(status().isServiceUnavailable());
    }

    @Test
    void cleansUpAndSuspends() throws Exception {
        MockHttpSession boss = login("adm_boss");
        MockHttpSession troll = login("adm_troll");
        MockHttpSession kind = login("adm_kind");

        long postId = json(mvc.perform(multipart("/api/posts").session(troll).param("body", "광고 글"))
                .andExpect(status().isCreated()).andReturn()).get("id").asLong();
        long keepId = json(mvc.perform(multipart("/api/posts").session(kind).param("body", "머란이 목욕한 날"))
                .andExpect(status().isCreated()).andReturn()).get("id").asLong();
        long commentId = json(mvc.perform(post("/api/posts/{id}/comments", keepId).session(troll)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"광고 댓글\"}"))
                .andExpect(status().isCreated()).andReturn()).get("id").asLong();
        mvc.perform(post("/api/rooms/adm_kind/guestbook").session(troll)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"광고 방명록\"}"))
                .andExpect(status().isCreated());

        // lists, newest first
        mvc.perform(get("/api/admin/posts").session(boss)).andExpect(jsonPath("$.items[0].id").value(keepId));
        mvc.perform(get("/api/admin/comments").session(boss))
                .andExpect(jsonPath("$.items[0].body").value("광고 댓글"))
                .andExpect(jsonPath("$.items[0].postId").value(keepId));
        long entryId = json(mvc.perform(get("/api/admin/guestbook").session(boss))
                .andExpect(jsonPath("$.items[0].roomHandle").value("adm_kind"))
                .andReturn()).path("items").get(0).path("id").asLong();
        mvc.perform(get("/api/admin/users").param("q", "adm_tro").session(boss))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].posts").value(1))
                .andExpect(jsonPath("$.items[0].lastActive").isNotEmpty());

        // cleaning up
        mvc.perform(delete("/api/admin/posts/{id}", postId).session(boss)).andExpect(status().isNoContent());
        mvc.perform(get("/api/posts/{id}", postId)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/admin/comments/{id}", commentId).session(boss)).andExpect(status().isNoContent());
        mvc.perform(get("/api/posts/{id}", keepId)).andExpect(jsonPath("$.commentCount").value(0));
        mvc.perform(delete("/api/admin/guestbook/{id}", entryId).session(boss)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/admin/posts/{id}", keepId).session(troll)).andExpect(status().isForbidden());

        // suspending: the session stops working and the account cannot log in again
        long trollId = json(mvc.perform(get("/api/auth/me").session(troll)).andReturn()).get("id").asLong();
        long bossId = json(mvc.perform(get("/api/auth/me").session(boss)).andReturn()).get("id").asLong();
        mvc.perform(post("/api/admin/users/{id}/suspend", trollId).session(boss)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"광고 도배\"}"))
                .andExpect(jsonPath("$.suspendReason").value("광고 도배"));
        mvc.perform(multipart("/api/posts").session(troll).param("body", "또 광고"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SUSPENDED"));
        mvc.perform(get("/api/auth/me").session(troll)).andExpect(status().isNoContent());
        mvc.perform(post("/api/auth/dev-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"adm_troll\",\"nickname\":\"x\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/users/{id}/suspend", bossId).session(boss)).andExpect(status().isBadRequest());

        mvc.perform(post("/api/admin/users/{id}/unsuspend", trollId).session(boss))
                .andExpect(jsonPath("$.suspendedAt").isEmpty());
        login("adm_troll");
    }

    private MockHttpSession login(String handle) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/dev-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"" + handle + "\",\"nickname\":\"" + handle + "\"}"))
                .andExpect(status().isOk()).andReturn();
        MockHttpSession s = (MockHttpSession) r.getRequest().getSession(false);
        // any call counts as today's activity (the login itself has no session yet)
        mvc.perform(get("/api/auth/me").session(s));
        return s;
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString());
    }
}
