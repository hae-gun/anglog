-- 관리자 페이지: 집사 정지와 하루 활동 기록(로그인한 집사가 그날 한 번이라도 API를 쓰면 한 줄).
ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN suspend_reason VARCHAR(200);

CREATE TABLE user_activity (
    user_id     BIGINT NOT NULL REFERENCES users (id),
    active_date DATE   NOT NULL,
    CONSTRAINT pk_user_activity PRIMARY KEY (user_id, active_date)
);
CREATE INDEX idx_user_activity_date ON user_activity (active_date);
