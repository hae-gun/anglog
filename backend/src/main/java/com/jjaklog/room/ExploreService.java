package com.jjaklog.room;

import com.jjaklog.common.JjaklogProperties;
import com.jjaklog.parrot.Parrot;
import com.jjaklog.parrot.ParrotRepository;
import com.jjaklog.parrot.ParrotView;
import com.jjaklog.post.ImageStorage;
import com.jjaklog.post.PostImageRepository;
import com.jjaklog.post.PostRepository;
import com.jjaklog.social.FollowRepository;
import com.jjaklog.user.User;
import com.jjaklog.user.UserService;
import com.jjaklog.user.UserSummary;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Finding rooms to visit: the "놀러가기" tab and "visit a random room".
 * Every lookup for the whole list is one query, so the tab costs a fixed handful of queries.
 */
@Service
public class ExploreService {

    static final int MAX_ROOMS = 30;

    /** One room in the visit list. postedToday lights the house window in the park. */
    public record RoomCard(
            UserSummary owner,
            List<ParrotView> parrots,
            String coverImageUrl,
            Instant latestPostAt,
            boolean postedToday,
            boolean following,
            boolean featherLeftToday) {
    }

    public record RandomRoom(String handle) {
    }

    private final UserService users;
    private final ParrotRepository parrots;
    private final PostRepository posts;
    private final PostImageRepository images;
    private final FollowRepository follows;
    private final FeatherRepository feathers;
    private final Clock clock;
    private final ZoneId zone;

    public ExploreService(UserService users, ParrotRepository parrots, PostRepository posts, PostImageRepository images,
                          FollowRepository follows, FeatherRepository feathers, Clock clock, JjaklogProperties props) {
        this.users = users;
        this.parrots = parrots;
        this.posts = posts;
        this.images = images;
        this.follows = follows;
        this.feathers = feathers;
        this.clock = clock;
        this.zone = props.zoneId();
    }

    /** Rooms I follow first, then rooms with the newest diaries, then rooms with newly registered birds. */
    @Transactional(readOnly = true)
    public List<RoomCard> rooms(Long viewerId) {
        Set<Long> followed = viewerId == null ? Set.of() : new HashSet<>(follows.followeeIds(viewerId));

        LinkedHashSet<Long> order = new LinkedHashSet<>();
        PageRequest wide = PageRequest.of(0, MAX_ROOMS * 2);
        order.addAll(followed);
        order.addAll(posts.recentAuthorIds(wide));
        order.addAll(parrots.recentOwnerIds(wide));
        if (viewerId != null) {
            order.remove(viewerId);
        }
        if (order.isEmpty()) {
            return List.of();
        }

        // A room without a bird has nothing to play with, so it is left out.
        Map<Long, List<Parrot>> birdsByOwner = parrots.findByOwnerIdInOrderByIdAsc(order).stream()
                .collect(Collectors.groupingBy(Parrot::getOwnerId));
        List<Long> ids = order.stream().filter(birdsByOwner::containsKey).limit(MAX_ROOMS).toList();
        if (ids.isEmpty()) {
            return List.of();
        }

        Map<Long, User> owners = users.byIds(ids);
        Map<Long, String> covers = new HashMap<>();
        for (Object[] row : images.coversByAuthors(ids, PageRequest.of(0, 300))) {
            covers.putIfAbsent((Long) row[0], (String) row[1]);
        }
        Map<Long, Instant> latest = new HashMap<>();
        for (Object[] row : posts.latestPostTimes(ids)) {
            latest.put((Long) row[0], (Instant) row[1]);
        }
        LocalDate today = LocalDate.now(clock.withZone(zone));
        Set<Long> visitedToday = viewerId == null ? Set.of() : new HashSet<>(feathers.visitedOn(viewerId, today, ids));

        List<RoomCard> cards = new ArrayList<>(ids.size());
        for (Long id : ids) {
            Instant latestAt = latest.get(id);
            User owner = owners.get(id);
            if (owner == null) {
                continue;
            }
            String cover = covers.get(id);
            cards.add(new RoomCard(
                    UserSummary.of(owner),
                    birdsByOwner.get(id).stream().map(ParrotView::of).toList(),
                    cover == null ? null : ImageStorage.url(cover),
                    latestAt,
                    latestAt != null && LocalDate.ofInstant(latestAt, zone).equals(today),
                    followed.contains(id),
                    visitedToday.contains(id)));
        }
        return cards;
    }

    /** "아무 방이나 놀러가기": a random room with a bird, not mine and not the one I'm leaving. */
    @Transactional(readOnly = true)
    public Optional<RandomRoom> random(Long viewerId, String excludeHandle) {
        List<Long> candidates = new ArrayList<>(parrots.allOwnerIds());
        candidates.remove(viewerId);
        if (excludeHandle != null && !excludeHandle.isBlank()) {
            try {
                candidates.remove(users.getByHandle(excludeHandle).getId());
            } catch (RuntimeException ignored) {
                // unknown handle: nothing to exclude
            }
        }
        if (candidates.isEmpty()) {
            return Optional.empty();
        }
        Collections.shuffle(candidates, ThreadLocalRandom.current());
        Map<Long, User> picked = users.byIds(List.of(candidates.get(0)));
        return picked.values().stream().findFirst().map(u -> new RandomRoom(u.getHandle()));
    }
}
