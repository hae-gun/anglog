package com.jjaklog.social;

import com.jjaklog.common.CursorPage;
import com.jjaklog.common.LoginUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SocialController {

    public record CommentRequest(@NotBlank @Size(max = 500) String body) {
    }

    private final SocialService social;

    public SocialController(SocialService social) {
        this.social = social;
    }

    @PostMapping("/api/posts/{id}/like")
    public SocialService.LikeState like(@LoginUser Long userId, @PathVariable Long id) {
        return social.like(userId, id);
    }

    @DeleteMapping("/api/posts/{id}/like")
    public SocialService.LikeState unlike(@LoginUser Long userId, @PathVariable Long id) {
        return social.unlike(userId, id);
    }

    @GetMapping("/api/posts/{id}/comments")
    public CursorPage<SocialService.CommentView> comments(@LoginUser(required = false) Long userId,
                                                          @PathVariable Long id,
                                                          @RequestParam(value = "after", required = false) Long after,
                                                          @RequestParam(value = "size", required = false) Integer size) {
        return social.comments(id, userId, after, size);
    }

    @PostMapping("/api/posts/{id}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public SocialService.CommentView addComment(@LoginUser Long userId, @PathVariable Long id,
                                                @Valid @RequestBody CommentRequest req) {
        return social.addComment(userId, id, req.body());
    }

    @DeleteMapping("/api/comments/{id}")
    public ResponseEntity<Void> deleteComment(@LoginUser Long userId, @PathVariable Long id) {
        social.deleteComment(userId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/users/{handle}/follow")
    public SocialService.FollowState follow(@LoginUser Long userId, @PathVariable String handle) {
        return social.follow(userId, handle);
    }

    @DeleteMapping("/api/users/{handle}/follow")
    public SocialService.FollowState unfollow(@LoginUser Long userId, @PathVariable String handle) {
        return social.unfollow(userId, handle);
    }
}
