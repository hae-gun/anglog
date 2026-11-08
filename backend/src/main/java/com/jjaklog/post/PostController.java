package com.jjaklog.post;

import com.jjaklog.common.CursorPage;
import com.jjaklog.common.LoginUser;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class PostController {

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    /** multipart/form-data: images (0..10 files), body, parrotId, weightG, mood */
    @PostMapping(value = "/api/posts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public PostView create(@LoginUser Long userId,
                           @RequestParam(value = "body", required = false) String body,
                           @RequestParam(value = "parrotId", required = false) Long parrotId,
                           @RequestParam(value = "weightG", required = false) BigDecimal weightG,
                           @RequestParam(value = "mood", required = false) Mood mood,
                           @RequestParam(value = "images", required = false) List<MultipartFile> images) {
        return postService.create(userId, new PostService.NewPost(body, parrotId, weightG, mood, images));
    }

    @GetMapping("/api/posts/{id}")
    public PostView get(@LoginUser(required = false) Long userId, @PathVariable Long id) {
        return postService.get(id, userId);
    }

    @DeleteMapping("/api/posts/{id}")
    public ResponseEntity<Void> delete(@LoginUser Long userId, @PathVariable Long id) {
        postService.delete(userId, id);
        return ResponseEntity.noContent().build();
    }

    /** tab=latest (everyone) or tab=following (people I follow and me). */
    @GetMapping("/api/feed")
    public CursorPage<PostView> feed(@LoginUser(required = false) Long userId,
                                     @RequestParam(value = "tab", defaultValue = "latest") String tab,
                                     @RequestParam(value = "cursor", required = false) Long cursor,
                                     @RequestParam(value = "size", required = false) Integer size) {
        return postService.feed(tab, userId, cursor, size);
    }
}
