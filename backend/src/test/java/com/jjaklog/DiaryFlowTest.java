package com.jjaklog;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** Walks through the first-release story end to end: sign up, register a bird, post a diary, visit a room. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DiaryFlowTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper om;

    @Test
    void diaryRoomAndSocialFlow() throws Exception {
        MockHttpSession alice = login("alice", "머란이네");
        MockHttpSession bob = login("bob", "보리네");

        // Alice registers her lovebird.
        long parrotId = json(mvc.perform(post("/api/parrots").session(alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"머란이","species":"LOVEBIRD","adoptedDate":"2025-01-01",
                                 "colors":{"face":"#F2784B","head":"#E0473A","body":"#5DBB4A","wing":"#4A9A3B","tail":"#4A9A3B"}}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.speciesLabel").value("모란앵무"))
                .andReturn()).get("id").asLong();

        // She posts a diary with a big photo, a weight and a mood. The photo is shrunk to 1600px.
        long postId = json(mvc.perform(multipart("/api/posts").session(alice)
                        .file(new MockMultipartFile("images", "morning.png", "image/png", png(2000, 1000)))
                        .param("body", "오늘 아침 종이를 세 장 찢었다")
                        .param("parrotId", String.valueOf(parrotId))
                        .param("weightG", "52.5")
                        .param("mood", "HAPPY"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.images[0].width").value(1600))
                .andExpect(jsonPath("$.images[0].height").value(800))
                .andExpect(jsonPath("$.moodLabel").value("신나요"))
                .andExpect(jsonPath("$.parrot.name").value("머란이"))
                .andReturn()).get("id").asLong();

        // Bob sees it in "latest" but not in "following" until he follows Alice.
        mvc.perform(get("/api/feed").param("tab", "latest").session(bob))
                .andExpect(jsonPath("$.items[0].id").value(postId));
        mvc.perform(get("/api/feed").param("tab", "following").session(bob))
                .andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(post("/api/users/alice/follow").session(bob))
                .andExpect(jsonPath("$.following").value(true))
                .andExpect(jsonPath("$.followerCount").value(1));
        mvc.perform(get("/api/feed").param("tab", "following").session(bob))
                .andExpect(jsonPath("$.items[0].id").value(postId));

        // Likes are counted once per person.
        mvc.perform(post("/api/posts/{id}/like", postId).session(bob)).andExpect(jsonPath("$.likeCount").value(1));
        mvc.perform(post("/api/posts/{id}/like", postId).session(bob)).andExpect(jsonPath("$.likeCount").value(1));
        mvc.perform(get("/api/posts/{id}", postId).session(bob)).andExpect(jsonPath("$.likedByMe").value(true));
        mvc.perform(delete("/api/posts/{id}/like", postId).session(bob)).andExpect(jsonPath("$.likeCount").value(0));

        // Comments.
        mvc.perform(post("/api/posts/{id}/comments", postId).session(bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"꼬리에 종이 꽂은 거 보고 싶어요\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.author.handle").value("bob"));
        mvc.perform(get("/api/posts/{id}", postId)).andExpect(jsonPath("$.commentCount").value(1));

        // Bob visits Alice's room: the photo hangs as a frame, the weight is on the scale.
        mvc.perform(get("/api/rooms/alice").session(bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.frames[0].postId").value(postId))
                .andExpect(jsonPath("$.today.latestWeightG").value(52.5))
                .andExpect(jsonPath("$.today.latestMood").value("HAPPY"))
                .andExpect(jsonPath("$.stats.postCount").value(1))
                .andExpect(jsonPath("$.stats.streakDays").value(1))
                .andExpect(jsonPath("$.relation.following").value(true))
                .andExpect(jsonPath("$.relation.featherLeftToday").value(false))
                .andExpect(jsonPath("$.badges[*].code", hasItem("FIRST_DIARY")));

        // One feather per visitor per day, and never in your own room.
        mvc.perform(post("/api/rooms/alice/feathers").session(bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.feathersToday").value(1));
        mvc.perform(post("/api/rooms/alice/feathers").session(bob))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_LEFT"));
        mvc.perform(post("/api/rooms/alice/feathers").session(alice))
                .andExpect(status().isBadRequest());

        // Guestbook.
        mvc.perform(post("/api/rooms/alice/guestbook").session(bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"머란이 안녕! 보리가 다녀가요\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/rooms/alice/guestbook"))
                .andExpect(jsonPath("$.items[0].body").value("머란이 안녕! 보리가 다녀가요"))
                .andExpect(jsonPath("$.items[0].canDelete").value(false));

        // Writing needs a login; only the author can delete.
        mvc.perform(multipart("/api/posts").param("body", "익명"))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/posts/{id}", postId).session(bob))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/posts/{id}", postId).session(alice))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/posts/{id}", postId))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsBadHandlesAndEmptyPosts() throws Exception {
        mvc.perform(post("/api/auth/dev-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"한글아이디\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_HANDLE"));

        MockHttpSession carol = login("carol", "캐롤");
        mvc.perform(multipart("/api/posts").session(carol).param("body", "   "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EMPTY_POST"));
        mvc.perform(multipart("/api/posts").session(carol).param("body", "체중만").param("weightG", "3"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_WEIGHT"));
    }

    private MockHttpSession login(String handle, String nickname) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/dev-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"" + handle + "\",\"nickname\":\"" + nickname + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) r.getRequest().getSession(false);
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString());
    }

    private static byte[] png(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(93, 187, 74));
        g.fillRect(0, 0, w, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }
}
