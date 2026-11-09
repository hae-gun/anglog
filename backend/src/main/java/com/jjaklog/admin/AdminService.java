package com.jjaklog.admin;

import com.jjaklog.admin.AdminViews.CommentRow;
import com.jjaklog.admin.AdminViews.Day;
import com.jjaklog.admin.AdminViews.GuestbookRow;
import com.jjaklog.admin.AdminViews.Totals;
import com.jjaklog.admin.AdminViews.UserRow;
import com.jjaklog.common.ApiException;
import com.jjaklog.common.CursorPage;
import com.jjaklog.common.JjaklogProperties;
import com.jjaklog.post.Post;
import com.jjaklog.post.PostAssembler;
import com.jjaklog.post.PostRepository;
import com.jjaklog.post.PostView;
import com.jjaklog.room.GuestbookEntry;
import com.jjaklog.room.GuestbookRepository;
import com.jjaklog.social.Comment;
import com.jjaklog.social.CommentRepository;
import com.jjaklog.user.User;
import com.jjaklog.user.UserGate;
import com.jjaklog.user.UserRepository;
import com.jjaklog.user.UserService;
import com.jjaklog.user.UserSummary;
import java.sql.Date;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminService {

    public static final int DAYS = 14;

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final UserRepository users;
    private final UserService userService;
    private final UserGate gate;
    private final AdminGuard guard;
    private final PostRepository posts;
    private final PostAssembler assembler;
    private final CommentRepository comments;
    private final GuestbookRepository guestbook;
    private final Clock clock;
    private final ZoneId zone;

    public AdminService(JdbcTemplate jdbc, NamedParameterJdbcTemplate named, UserRepository users, UserService userService,
                        UserGate gate, AdminGuard guard, PostRepository posts, PostAssembler assembler,
                        CommentRepository comments, GuestbookRepository guestbook, Clock clock, JjaklogProperties props) {
        this.jdbc = jdbc;
        this.named = named;
        this.users = users;
        this.userService = userService;
        this.gate = gate;
        this.guard = guard;
        this.posts = posts;
        this.assembler = assembler;
        this.comments = comments;
        this.guestbook = guestbook;
        this.clock = clock;
        this.zone = props.zoneId();
    }

    // ---- overview --------------------------------------------------------

    public Totals totals() {
        return new Totals(count("users"), count("parrots"), count("posts"), count("comments"),
                count("guestbook_entries"), count("feathers"),
                jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE suspended_at IS NOT NULL", Long.class));
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
    }

    /** The last 14 days, oldest first, in the service's time zone (Korea). */
    public List<Day> days() {
        LocalDate today = LocalDate.now(clock.withZone(zone));
        LocalDate first = today.minusDays(DAYS - 1);
        OffsetDateTime from = first.atStartOfDay(zone).toOffsetDateTime().withOffsetSameInstant(ZoneOffset.UTC);
        Map<LocalDate, Long> signups = byDay("SELECT created_at FROM users WHERE created_at >= ?", from);
        Map<LocalDate, Long> written = byDay("SELECT created_at FROM posts WHERE created_at >= ?", from);
        Map<LocalDate, Long> active = new HashMap<>();
        jdbc.query("SELECT active_date, COUNT(*) FROM user_activity WHERE active_date >= ? GROUP BY active_date",
                rs -> { active.put(rs.getDate(1).toLocalDate(), rs.getLong(2)); }, Date.valueOf(first));
        List<Day> out = new ArrayList<>();
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) {
            out.add(new Day(d, signups.getOrDefault(d, 0L), written.getOrDefault(d, 0L), active.getOrDefault(d, 0L)));
        }
        return out;
    }

    private Map<LocalDate, Long> byDay(String sql, OffsetDateTime from) {
        return jdbc.query(sql, (rs, i) -> rs.getObject(1, OffsetDateTime.class).toInstant(), from).stream()
                .collect(Collectors.groupingBy(t -> t.atZone(zone).toLocalDate(), Collectors.counting()));
    }

    // ---- owners ----------------------------------------------------------

    @Transactional(readOnly = true)
    public CursorPage<UserRow> users(String q, Long cursor) {
        String query = q == null ? "" : q.trim().toLowerCase().replace("%", "").replace("_", "\\_");
        String like = query.isEmpty() ? "" : "%" + query + "%";
        List<User> rows = users.adminPage(like, CursorPage.cursorOrMax(cursor), PageRequest.of(0, 51));
        return CursorPage.of(rows, 50, User::getId, this::userRows);
    }

    private List<UserRow> userRows(List<User> list) {
        if (list.isEmpty()) {
            return List.of();
        }
        MapSqlParameterSource ids = new MapSqlParameterSource("ids", list.stream().map(User::getId).toList());
        Map<Long, Long> parrots = countBy("SELECT owner_id, COUNT(*) FROM parrots WHERE owner_id IN (:ids) GROUP BY owner_id", ids);
        Map<Long, Long> written = countBy("SELECT author_id, COUNT(*) FROM posts WHERE author_id IN (:ids) GROUP BY author_id", ids);
        Map<Long, LocalDate> last = new HashMap<>();
        named.query("SELECT user_id, MAX(active_date) FROM user_activity WHERE user_id IN (:ids) GROUP BY user_id", ids,
                rs -> { last.put(rs.getLong(1), rs.getDate(2).toLocalDate()); });
        return list.stream().map(u -> new UserRow(u.getId(), u.getHandle(), u.getNickname(), u.getCreatedAt(),
                parrots.getOrDefault(u.getId(), 0L), written.getOrDefault(u.getId(), 0L), last.get(u.getId()),
                u.getSuspendedAt(), u.getSuspendReason(), guard.isAdmin(u))).toList();
    }

    private Map<Long, Long> countBy(String sql, MapSqlParameterSource params) {
        Map<Long, Long> out = new HashMap<>();
        named.query(sql, params, rs -> { out.put(rs.getLong(1), rs.getLong(2)); });
        return out;
    }

    @Transactional
    public UserRow suspend(Long adminId, Long userId, String reason) {
        User user = userService.get(userId);
        if (user.getId().equals(adminId) || guard.isAdmin(user)) {
            throw ApiException.badRequest("ADMIN_TARGET", "관리자 계정은 정지할 수 없어요.");
        }
        String why = reason == null || reason.isBlank() ? null : reason.trim();
        if (why != null && why.length() > 200) {
            why = why.substring(0, 200);
        }
        user.suspend(Instant.now(clock), why);
        gate.setSuspended(user.getId(), true);
        return userRows(List.of(user)).get(0);
    }

    @Transactional
    public UserRow unsuspend(Long userId) {
        User user = userService.get(userId);
        user.unsuspend();
        gate.setSuspended(user.getId(), false);
        return userRows(List.of(user)).get(0);
    }

    // ---- content ---------------------------------------------------------

    @Transactional(readOnly = true)
    public CursorPage<PostView> posts(Long cursor) {
        List<Post> rows = posts.latest(CursorPage.cursorOrMax(cursor), PageRequest.of(0, 31));
        return CursorPage.of(rows, 30, Post::getId, list -> assembler.toViews(list, null));
    }

    @Transactional
    public void deletePost(Long postId) {
        Post post = posts.findById(postId).orElseThrow(() -> ApiException.notFound("일기"));
        // photos, likes and comments go with it (ON DELETE CASCADE)
        posts.delete(post);
    }

    @Transactional(readOnly = true)
    public CursorPage<CommentRow> comments(Long cursor) {
        List<Comment> rows = comments.recent(CursorPage.cursorOrMax(cursor), PageRequest.of(0, 51));
        return CursorPage.of(rows, 50, Comment::getId, list -> {
            Map<Long, User> authors = userService.byIds(list.stream().map(Comment::getAuthorId).collect(Collectors.toSet()));
            return list.stream().map(c -> new CommentRow(c.getId(), summary(authors, c.getAuthorId()), c.getBody(),
                    c.getCreatedAt(), c.getPostId())).toList();
        });
    }

    @Transactional
    public void deleteComment(Long commentId) {
        Comment c = comments.findById(commentId).orElseThrow(() -> ApiException.notFound("댓글"));
        comments.delete(c);
        posts.addComments(c.getPostId(), -1);
    }

    @Transactional(readOnly = true)
    public CursorPage<GuestbookRow> guestbook(Long cursor) {
        List<GuestbookEntry> rows = guestbook.recent(CursorPage.cursorOrMax(cursor), PageRequest.of(0, 51));
        return CursorPage.of(rows, 50, GuestbookEntry::getId, list -> {
            Set<Long> ids = new HashSet<>();
            list.forEach(g -> { ids.add(g.getAuthorId()); ids.add(g.getRoomOwnerId()); });
            Map<Long, User> people = userService.byIds(ids);
            return list.stream().map(g -> new GuestbookRow(g.getId(), summary(people, g.getAuthorId()), g.getBody(),
                    g.getCreatedAt(), people.containsKey(g.getRoomOwnerId()) ? people.get(g.getRoomOwnerId()).getHandle() : null))
                    .toList();
        });
    }

    @Transactional
    public void deleteGuestbook(Long entryId) {
        guestbook.delete(guestbook.findById(entryId).orElseThrow(() -> ApiException.notFound("방명록")));
    }

    private static UserSummary summary(Map<Long, User> users, Long id) {
        User u = users.get(id);
        return u == null ? null : UserSummary.of(u);
    }
}
