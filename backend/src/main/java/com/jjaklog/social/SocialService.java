package com.jjaklog.social;

import com.jjaklog.common.ApiException;
import com.jjaklog.common.CursorPage;
import com.jjaklog.post.Post;
import com.jjaklog.post.PostRepository;
import com.jjaklog.post.PostService;
import com.jjaklog.user.User;
import com.jjaklog.user.UserService;
import com.jjaklog.user.UserSummary;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Likes, comments and follows. */
@Service
public class SocialService {

    public record LikeState(boolean liked, int likeCount) {
    }

    public record CommentView(Long id, UserSummary author, String body, Instant createdAt, boolean mine) {
    }

    public record FollowState(boolean following, long followerCount) {
    }

    static final int MAX_COMMENT = 500;

    private final PostLikeRepository likes;
    private final CommentRepository comments;
    private final FollowRepository follows;
    private final PostRepository posts;
    private final PostService postService;
    private final UserService users;
    private final Clock clock;

    public SocialService(PostLikeRepository likes, CommentRepository comments, FollowRepository follows,
                         PostRepository posts, PostService postService, UserService users, Clock clock) {
        this.likes = likes;
        this.comments = comments;
        this.follows = follows;
        this.posts = posts;
        this.postService = postService;
        this.users = users;
        this.clock = clock;
    }

    // ---- likes -----------------------------------------------------------

    @Transactional
    public LikeState like(Long userId, Long postId) {
        postService.find(postId);
        if (!likes.existsByPostIdAndUserId(postId, userId)) {
            likes.save(new PostLike(postId, userId, Instant.now(clock)));
            posts.addLikes(postId, 1);
        }
        return new LikeState(true, postService.find(postId).getLikeCount());
    }

    @Transactional
    public LikeState unlike(Long userId, Long postId) {
        postService.find(postId);
        if (likes.deleteByPostIdAndUserId(postId, userId) > 0) {
            posts.addLikes(postId, -1);
        }
        return new LikeState(false, postService.find(postId).getLikeCount());
    }

    // ---- comments --------------------------------------------------------

    @Transactional(readOnly = true)
    public CursorPage<CommentView> comments(Long postId, Long viewerId, Long after, Integer size) {
        postService.find(postId);
        int n = CursorPage.clampSize(size == null ? 30 : size);
        List<Comment> rows = comments.page(postId, after == null ? 0L : after, PageRequest.of(0, n + 1));
        return CursorPage.of(rows, n, Comment::getId, list -> toViews(list, viewerId));
    }

    @Transactional
    public CommentView addComment(Long userId, Long postId, String rawBody) {
        postService.find(postId);
        String body = rawBody == null ? "" : rawBody.strip();
        if (body.isEmpty()) {
            throw ApiException.badRequest("EMPTY_COMMENT", "댓글 내용을 적어 주세요.");
        }
        if (body.length() > MAX_COMMENT) {
            throw ApiException.badRequest("COMMENT_TOO_LONG", "댓글은 " + MAX_COMMENT + "자까지예요.");
        }
        Comment saved = comments.save(new Comment(postId, userId, body, Instant.now(clock)));
        posts.addComments(postId, 1);
        return toViews(List.of(saved), userId).get(0);
    }

    @Transactional
    public void deleteComment(Long userId, Long commentId) {
        Comment c = comments.findById(commentId).orElseThrow(() -> ApiException.notFound("댓글"));
        Post post = postService.find(c.getPostId());
        if (!c.getAuthorId().equals(userId) && !post.getAuthorId().equals(userId)) {
            throw ApiException.forbidden("내 댓글이나 내 글의 댓글만 지울 수 있어요.");
        }
        comments.delete(c);
        posts.addComments(post.getId(), -1);
    }

    private List<CommentView> toViews(List<Comment> rows, Long viewerId) {
        Map<Long, User> authors = users.byIds(rows.stream().map(Comment::getAuthorId).collect(Collectors.toSet()));
        return rows.stream().map(c -> new CommentView(
                c.getId(),
                authors.containsKey(c.getAuthorId()) ? UserSummary.of(authors.get(c.getAuthorId())) : null,
                c.getBody(),
                c.getCreatedAt(),
                c.getAuthorId().equals(viewerId))).toList();
    }

    // ---- follows ---------------------------------------------------------

    @Transactional
    public FollowState follow(Long userId, String handle) {
        User target = users.getByHandle(handle);
        if (target.getId().equals(userId)) {
            throw ApiException.badRequest("SELF_FOLLOW", "내 방은 팔로우할 수 없어요.");
        }
        if (!follows.existsByFollowerIdAndFolloweeId(userId, target.getId())) {
            follows.save(new Follow(userId, target.getId(), Instant.now(clock)));
        }
        return new FollowState(true, follows.countByFolloweeId(target.getId()));
    }

    @Transactional
    public FollowState unfollow(Long userId, String handle) {
        User target = users.getByHandle(handle);
        follows.unfollow(userId, target.getId());
        return new FollowState(false, follows.countByFolloweeId(target.getId()));
    }
}
