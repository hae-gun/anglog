package com.jjaklog.admin;

import com.fasterxml.jackson.databind.JsonNode;
import com.jjaklog.admin.AdminViews.CommentRow;
import com.jjaklog.admin.AdminViews.GuestbookRow;
import com.jjaklog.admin.AdminViews.KickRequest;
import com.jjaklog.admin.AdminViews.Overview;
import com.jjaklog.admin.AdminViews.SuspendRequest;
import com.jjaklog.admin.AdminViews.UserRow;
import com.jjaklog.common.ApiException;
import com.jjaklog.common.CursorPage;
import com.jjaklog.common.LoginUser;
import com.jjaklog.post.PostView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 앵로그와 앵파크 관리. Every call checks the admin list (ADMIN_HANDLES) and leaves a log line for changes. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);

    private final AdminGuard guard;
    private final AdminService admin;
    private final RealtimeAdmin park;

    public AdminController(AdminGuard guard, AdminService admin, RealtimeAdmin park) {
        this.guard = guard;
        this.admin = admin;
        this.park = park;
    }

    @GetMapping("/overview")
    public Overview overview(@LoginUser Long userId) {
        guard.require(userId);
        JsonNode state = null;
        String error = null;
        try {
            state = park.state();
        } catch (ApiException e) {
            error = e.getMessage();
        }
        return new Overview(admin.totals(), admin.days(), state, error);
    }

    @GetMapping("/users")
    public CursorPage<UserRow> users(@LoginUser Long userId, @RequestParam(required = false) String q,
                                     @RequestParam(required = false) Long cursor) {
        guard.require(userId);
        return admin.users(q, cursor);
    }

    @PostMapping("/users/{id}/suspend")
    public UserRow suspend(@LoginUser Long userId, @PathVariable Long id, @RequestBody(required = false) SuspendRequest req) {
        String by = guard.require(userId).getHandle();
        UserRow row = admin.suspend(userId, id, req == null ? null : req.reason());
        log.info("admin {} suspended user {} ({})", by, row.handle(), row.suspendReason());
        return row;
    }

    @PostMapping("/users/{id}/unsuspend")
    public UserRow unsuspend(@LoginUser Long userId, @PathVariable Long id) {
        String by = guard.require(userId).getHandle();
        UserRow row = admin.unsuspend(id);
        log.info("admin {} lifted the suspension of user {}", by, row.handle());
        return row;
    }

    @GetMapping("/posts")
    public CursorPage<PostView> posts(@LoginUser Long userId, @RequestParam(required = false) Long cursor) {
        guard.require(userId);
        return admin.posts(cursor);
    }

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<Void> deletePost(@LoginUser Long userId, @PathVariable Long id) {
        String by = guard.require(userId).getHandle();
        admin.deletePost(id);
        log.info("admin {} deleted post {}", by, id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/comments")
    public CursorPage<CommentRow> comments(@LoginUser Long userId, @RequestParam(required = false) Long cursor) {
        guard.require(userId);
        return admin.comments(cursor);
    }

    @DeleteMapping("/comments/{id}")
    public ResponseEntity<Void> deleteComment(@LoginUser Long userId, @PathVariable Long id) {
        String by = guard.require(userId).getHandle();
        admin.deleteComment(id);
        log.info("admin {} deleted comment {}", by, id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/guestbook")
    public CursorPage<GuestbookRow> guestbook(@LoginUser Long userId, @RequestParam(required = false) Long cursor) {
        guard.require(userId);
        return admin.guestbook(cursor);
    }

    @DeleteMapping("/guestbook/{id}")
    public ResponseEntity<Void> deleteGuestbook(@LoginUser Long userId, @PathVariable Long id) {
        String by = guard.require(userId).getHandle();
        admin.deleteGuestbook(id);
        log.info("admin {} deleted guestbook entry {}", by, id);
        return ResponseEntity.noContent().build();
    }

    /** Who is in the park right now (straight from the realtime server). */
    @GetMapping("/park")
    public JsonNode park(@LoginUser Long userId) {
        guard.require(userId);
        return park.state();
    }

    /** Sends a bird out of the park; its address may not come back for a while (default 60 minutes). */
    @PostMapping("/park/kick")
    public JsonNode kick(@LoginUser Long userId, @RequestBody KickRequest req) {
        String by = guard.require(userId).getHandle();
        int minutes = req.minutes() == null ? 60 : Math.max(0, Math.min(req.minutes(), 24 * 60));
        JsonNode out = park.kick(req.channel(), req.pid(), minutes);
        log.info("admin {} kicked bird {} in channel {} for {} minutes", by, req.pid(), req.channel(), minutes);
        return out;
    }
}
