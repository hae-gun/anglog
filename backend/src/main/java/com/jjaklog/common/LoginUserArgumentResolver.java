package com.jjaklog.common;

import com.jjaklog.user.UserGate;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

public class LoginUserArgumentResolver implements HandlerMethodArgumentResolver {

    private final UserGate gate;

    public LoginUserArgumentResolver(UserGate gate) {
        this.gate = gate;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(LoginUser.class)
                && Long.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
        HttpSession session = request == null ? null : request.getSession(false);
        Object uid = session == null ? null : session.getAttribute(SessionKeys.USER_ID);
        LoginUser annotation = parameter.getParameterAnnotation(LoginUser.class);
        if (uid == null) {
            if (annotation != null && annotation.required()) {
                throw ApiException.unauthorized();
            }
            return null;
        }
        Long userId = (Long) uid;
        if (gate.isSuspended(userId)) {
            // a suspended owner is logged out on their next request
            session.invalidate();
            if (annotation != null && annotation.required()) {
                throw UserGate.suspended();
            }
            return null;
        }
        gate.touch(userId);
        return userId;
    }
}
