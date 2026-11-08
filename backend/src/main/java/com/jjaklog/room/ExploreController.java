package com.jjaklog.room;

import com.jjaklog.common.LoginUser;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ExploreController {

    private final ExploreService explore;

    public ExploreController(ExploreService explore) {
        this.explore = explore;
    }

    @GetMapping("/api/explore/rooms")
    public List<ExploreService.RoomCard> rooms(@LoginUser(required = false) Long userId) {
        return explore.rooms(userId);
    }

    /** 204 when there is no other room yet. */
    @GetMapping("/api/explore/random")
    public ResponseEntity<ExploreService.RandomRoom> random(@LoginUser(required = false) Long userId,
                                                           @RequestParam(value = "exclude", required = false) String exclude) {
        return explore.random(userId, exclude)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
