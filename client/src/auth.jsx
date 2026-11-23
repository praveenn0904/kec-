import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));
  // After an explicit log-out the next person must not be sent to the previous user's last page.
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      setUser(null);
    });
    if (!tokenStore.get()) return;
    api
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (role, email, password) => {
    const res = await api.login({ role, email, password });
    tokenStore.set(res.token);
    setLoggedOut(false);
    setUser(res.user);
  }, []);

  const register = useCallback(async (values) => {
    const res = await api.register(values);
    tokenStore.set(res.token);
    setLoggedOut(false);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setLoggedOut(true);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => setUser(await api.me()), []);

  const value = useMemo(() => ({ user, loading, loggedOut, login, register, logout, refresh }), [user, loading, loggedOut, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Which portal a signed-in person gets: student, department staff (faculty) or placement coordinator. */
export const kindOf = (u) => (!u ? null : u.role === 'student' ? 'student' : u.role === 'admin' ? 'admin' : u.staffRole === 'placement' ? 'placement' : 'faculty');
