package com.jjaklog.room;

import com.jjaklog.common.CursorPage;
import com.jjaklog.common.LoginUser;
import com.jjaklog.post.PostView;
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
public class RoomController {

    public record GuestbookRequest(@NotBlank @Size(max = 300) String body) {
    }

    private final RoomService rooms;

    public RoomController(RoomService rooms) {
        this.rooms = rooms;
    }

    @GetMapping("/api/rooms/{handle}")
    public RoomView room(@LoginUser(required = false) Long userId, @PathVariable String handle) {
        return rooms.view(handle, userId);
    }

    @GetMapping("/api/rooms/{handle}/posts")
    public CursorPage<PostView> posts(@LoginUser(required = false) Long userId, @PathVariable String handle,
                                      @RequestParam(value = "cursor", required = false) Long cursor,
                                      @RequestParam(value = "size", required = false) Integer size) {
        return rooms.posts(handle, userId, cursor, size);
    }

    @PostMapping("/api/rooms/{handle}/feathers")
    public RoomService.FeatherResult leaveFeather(@LoginUser Long userId, @PathVariable String handle) {
        return rooms.leaveFeather(handle, userId);
    }

    @GetMapping("/api/rooms/{handle}/guestbook")
    public CursorPage<RoomService.GuestbookView> guestbook(@LoginUser(required = false) Long userId,
                                                           @PathVariable String handle,
                                                           @RequestParam(value = "cursor", required = false) Long cursor,
                                                           @RequestParam(value = "size", required = false) Integer size) {
        return rooms.guestbook(handle, userId, cursor, size);
    }

    @PostMapping("/api/rooms/{handle}/guestbook")
    @ResponseStatus(HttpStatus.CREATED)
    public RoomService.GuestbookView writeGuestbook(@LoginUser Long userId, @PathVariable String handle,
                                                    @Valid @RequestBody GuestbookRequest req) {
        return rooms.writeGuestbook(handle, userId, req.body());
    }

    @DeleteMapping("/api/guestbook/{id}")
    public ResponseEntity<Void> deleteGuestbook(@LoginUser Long userId, @PathVariable Long id) {
        rooms.deleteGuestbook(id, userId);
        return ResponseEntity.noContent().build();
    }
}
