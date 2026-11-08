package com.jjaklog.room;

import com.jjaklog.common.ApiException;
import com.jjaklog.common.CursorPage;
import com.jjaklog.common.JjaklogProperties;
import com.jjaklog.parrot.Parrot;
import com.jjaklog.parrot.ParrotService;
import com.jjaklog.parrot.ParrotView;
import com.jjaklog.post.Post;
import com.jjaklog.post.PostRepository;
import com.jjaklog.post.PostService;
import com.jjaklog.post.PostView;
import com.jjaklog.social.FollowRepository;
import com.jjaklog.user.User;
import com.jjaklog.user.UserService;
import com.jjaklog.user.UserSummary;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoomService {

    static final int FRAME_COUNT = 8;
    static final int MAX_GUESTBOOK = 300;
    private static final String DEFAULT_FEATHER = "#9BC9A0";

    public record GuestbookView(Long id, UserSummary author, String body, Instant createdAt, boolean canDelete) {
    }

    public record FeatherResult(long featherCount, long feathersToday) {
    }

    private final UserService users;
    private final ParrotService parrots;
    private final PostService postService;
    private final PostRepository posts;
    private final FollowRepository follows;
    private final GuestbookRepository guestbook;
    private final FeatherRepository feathers;
    private final Clock clock;
    private final ZoneId zone;

    public RoomService(UserService users, ParrotService parrots, PostService postService, PostRepository posts,
                       FollowRepository follows, GuestbookRepository guestbook, FeatherRepository feathers,
                       Clock clock, JjaklogProperties props) {
        this.users = users;
        this.parrots = parrots;
        this.postService = postService;
        this.posts = posts;
        this.follows = follows;
        this.guestbook = guestbook;
        this.feathers = feathers;
        this.clock = clock;
        this.zone = props.zoneId();
    }

    @Transactional(readOnly = true)
    public RoomView view(String handle, Long viewerId) {
        User owner = users.getByHandle(handle);
        Long ownerId = owner.getId();
        LocalDate today = LocalDate.now(clock.withZone(zone));
        List<Parrot> birds = parrots.ofOwner(ownerId);

        // Frames: the newest photo diaries. Scan a few recent pages for posts that have photos.
        List<RoomView.Frame> frames = new ArrayList<>();
        Long cursor = null;
        for (int pageNo = 0; pageNo < 3 && frames.size() < FRAME_COUNT; pageNo++) {
            CursorPage<PostView> page = postService.byAuthor(ownerId, viewerId, cursor, 30);
            for (PostView p : page.items()) {
                if (!p.images().isEmpty() && frames.size() < FRAME_COUNT) {
                    PostView.ImageView img = p.images().get(0);
                    frames.add(new RoomView.Frame(p.id(), img.url(), img.width(), img.height(), p.createdAt()));
                }
            }
            if (page.nextCursor() == null) {
                break;
            }
            cursor = page.nextCursor();
        }

        Post weighed = posts.findFirstByAuthorIdAndWeightGIsNotNullOrderByIdDesc(ownerId).orElse(null);
        Post moody = posts.findFirstByAuthorIdAndMoodIsNotNullOrderByIdDesc(ownerId).orElse(null);
        RoomView.Today todayView = new RoomView.Today(
                weighed == null ? null : weighed.getWeightG(),
                weighed == null ? null : weighed.getCreatedAt(),
                moody == null ? null : moody.getMood(),
                moody == null ? null : moody.getMood().label(),
                moody == null ? null : moody.getCreatedAt());

        long postCount = posts.countByAuthorId(ownerId);
        int streak = streakDays(ownerId, today);
        RoomView.Stats stats = new RoomView.Stats(
                postCount,
                streak,
                follows.countByFolloweeId(ownerId),
                follows.countByFollowerId(ownerId),
                feathers.countByRoomOwnerId(ownerId),
                feathers.countByRoomOwnerIdAndVisitDate(ownerId, today),
                guestbook.countByRoomOwnerId(ownerId));

        boolean isMe = ownerId.equals(viewerId);
        RoomView.Relation relation = new RoomView.Relation(
                isMe,
                viewerId != null && !isMe && follows.existsByFollowerIdAndFolloweeId(viewerId, ownerId),
                viewerId != null && feathers.existsByRoomOwnerIdAndVisitorIdAndVisitDate(ownerId, viewerId, today));

        List<Feather> recentFeathers = feathers.recent(ownerId, PageRequest.of(0, 30));
        Map<Long, User> visitors = users.byIds(recentFeathers.stream().map(Feather::getVisitorId).collect(Collectors.toSet()));
        List<RoomView.FeatherView> featherViews = recentFeathers.stream()
                .map(f -> new RoomView.FeatherView(
                        f.getColor(),
                        visitors.containsKey(f.getVisitorId()) ? visitors.get(f.getVisitorId()).getHandle() : null,
                        f.getVisitDate()))
                .toList();

        return new RoomView(
                UserSummary.of(owner),
                birds.stream().map(ParrotView::of).toList(),
                frames,
                todayView,
                stats,
                relation,
                badges(birds, postCount, streak, today),
                featherViews);
    }

    @Transactional(readOnly = true)
    public CursorPage<PostView> posts(String handle, Long viewerId, Long cursor, Integer size) {
        User owner = users.getByHandle(handle);
        return postService.byAuthor(owner.getId(), viewerId, cursor, size);
    }

    // ---- feathers --------------------------------------------------------

    @Transactional
    public FeatherResult leaveFeather(String handle, Long visitorId) {
        User owner = users.getByHandle(handle);
        if (owner.getId().equals(visitorId)) {
            throw ApiException.badRequest("OWN_ROOM", "내 방에는 깃털을 남길 수 없어요.");
        }
        LocalDate today = LocalDate.now(clock.withZone(zone));
        if (feathers.existsByRoomOwnerIdAndVisitorIdAndVisitDate(owner.getId(), visitorId, today)) {
            throw ApiException.conflict("ALREADY_LEFT", "오늘은 이미 깃털을 남겼어요. 내일 또 놀러와요.");
        }
        String color = parrots.ofOwner(visitorId).stream().findFirst()
                .map(p -> p.colors().body())
                .orElse(DEFAULT_FEATHER);
        try {
            feathers.saveAndFlush(new Feather(owner.getId(), visitorId, today, color, Instant.now(clock)));
        } catch (DataIntegrityViolationException e) {
            // Two taps at once: the unique key (room, visitor, day) keeps it to one.
            throw ApiException.conflict("ALREADY_LEFT", "오늘은 이미 깃털을 남겼어요. 내일 또 놀러와요.");
        }
        return new FeatherResult(feathers.countByRoomOwnerId(owner.getId()),
                feathers.countByRoomOwnerIdAndVisitDate(owner.getId(), today));
    }

    // ---- guestbook -------------------------------------------------------

    @Transactional(readOnly = true)
    public CursorPage<GuestbookView> guestbook(String handle, Long viewerId, Long cursor, Integer size) {
        User owner = users.getByHandle(handle);
        int n = CursorPage.clampSize(size);
        List<GuestbookEntry> rows = guestbook.page(owner.getId(), CursorPage.cursorOrMax(cursor), PageRequest.of(0, n + 1));
        return CursorPage.of(rows, n, GuestbookEntry::getId, list -> toGuestbookViews(list, owner.getId(), viewerId));
    }

    @Transactional
    public GuestbookView writeGuestbook(String handle, Long authorId, String rawBody) {
        User owner = users.getByHandle(handle);
        String body = rawBody == null ? "" : rawBody.strip();
        if (body.isEmpty()) {
            throw ApiException.badRequest("EMPTY_GUESTBOOK", "방명록 내용을 적어 주세요.");
        }
        if (body.length() > MAX_GUESTBOOK) {
            throw ApiException.badRequest("GUESTBOOK_TOO_LONG", "방명록은 " + MAX_GUESTBOOK + "자까지예요.");
        }
        GuestbookEntry saved = guestbook.save(new GuestbookEntry(owner.getId(), authorId, body, Instant.now(clock)));
        return toGuestbookViews(List.of(saved), owner.getId(), authorId).get(0);
    }

    @Transactional
    public void deleteGuestbook(Long entryId, Long userId) {
        GuestbookEntry entry = guestbook.findById(entryId).orElseThrow(() -> ApiException.notFound("방명록"));
        if (!entry.getAuthorId().equals(userId) && !entry.getRoomOwnerId().equals(userId)) {
            throw ApiException.forbidden("내가 쓴 글이나 내 방의 방명록만 지울 수 있어요.");
        }
        guestbook.delete(entry);
    }

    private List<GuestbookView> toGuestbookViews(List<GuestbookEntry> rows, Long ownerId, Long viewerId) {
        Map<Long, User> authors = users.byIds(rows.stream().map(GuestbookEntry::getAuthorId).collect(Collectors.toSet()));
        return rows.stream().map(g -> new GuestbookView(
                g.getId(),
                authors.containsKey(g.getAuthorId()) ? UserSummary.of(authors.get(g.getAuthorId())) : null,
                g.getBody(),
                g.getCreatedAt(),
                viewerId != null && (g.getAuthorId().equals(viewerId) || ownerId.equals(viewerId)))).toList();
    }

    // ---- streak and badges -----------------------------------------------

    /** Consecutive days with at least one diary, counting back from today (or yesterday if nothing yet today). */
    int streakDays(Long ownerId, LocalDate today) {
        Instant since = today.minusDays(400).atStartOfDay(zone).toInstant();
        Set<LocalDate> days = posts.postTimesSince(ownerId, since).stream()
                .map(t -> t.atZone(zone).toLocalDate())
                .collect(Collectors.toSet());
        LocalDate day = days.contains(today) ? today : today.minusDays(1);
        int streak = 0;
        while (days.contains(day)) {
            streak++;
            day = day.minusDays(1);
        }
        return streak;
    }

    static List<RoomView.Badge> badges(List<Parrot> birds, long postCount, int streak, LocalDate today) {
        List<RoomView.Badge> out = new ArrayList<>();
        if (postCount >= 1) {
            out.add(new RoomView.Badge("FIRST_DIARY", "첫 일기"));
        }
        if (postCount >= 30) {
            out.add(new RoomView.Badge("DIARY_30", "일기 30편"));
        }
        if (streak >= 7) {
            out.add(new RoomView.Badge("STREAK_7", "7일 연속 기록"));
        }
        if (streak >= 30) {
            out.add(new RoomView.Badge("STREAK_30", "30일 연속 기록"));
        }
        for (Parrot p : birds) {
            LocalDate born = p.getBirthDate();
            if (born != null && born.getMonth() == today.getMonth() && born.getDayOfMonth() == today.getDayOfMonth()) {
                out.add(new RoomView.Badge("BIRTHDAY_TODAY", p.getName() + " 생일"));
            }
            LocalDate adopted = p.getAdoptedDate();
            if (adopted != null) {
                long together = ChronoUnit.DAYS.between(adopted, today);
                if (together >= 100) {
                    out.add(new RoomView.Badge("TOGETHER_100", p.getName() + "와 함께한 지 100일"));
                }
                if (adopted.getYear() < today.getYear()
                        && adopted.getMonth() == today.getMonth() && adopted.getDayOfMonth() == today.getDayOfMonth()) {
                    out.add(new RoomView.Badge("ADOPTION_DAY", p.getName() + " 입양 기념일"));
                }
            }
        }
        return out;
    }
}
