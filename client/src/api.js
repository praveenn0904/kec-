const BASE = '/api';
const TOKEN_KEY = 'ccm_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const token = tokenStore.get();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Check that it is running.', 0);
  }
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // An expired/invalid session on a logged-in request sends the user back to the login page.
    if (res.status === 401 && token && !path.startsWith('/auth/login') && onUnauthorized) onUnauthorized();
    throw new ApiError(data.error || 'Request failed', res.status, data.fields);
  }
  return data;
}

const toQuery = (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null && v !== false) sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const api = {
  meta: () => request('/meta'),

  login: (body) => request('/auth/login', { method: 'POST', body }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  me: () => request('/auth/me'),
  changePassword: (body) => request('/auth/change-password', { method: 'POST', body }),

  contacts: (params) => request(`/contacts${toQuery(params)}`),
  createContact: (body) => request('/contacts', { method: 'POST', body }),
  updateContact: (id, body) => request(`/contacts/${id}`, { method: 'PUT', body }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),

  stats: (today) => request(`/stats${toQuery({ today })}`),

  timetable: (params) => request(`/timetable${toQuery(params)}`),
  timetableStaff: (params) => request(`/timetable/staff${toQuery(params)}`),
  saveSlot: (body) => request('/timetable', { method: 'PUT', body }),
  deleteSlot: (id) => request(`/timetable/${id}`, { method: 'DELETE' }),

  grid: (params) => request(`/attendance/grid${toQuery(params)}`),

  catMe: () => request('/cat/me'),
  catSubjects: (params) => request(`/cat/subjects${toQuery(params)}`),
  catClass: (params) => request(`/cat/class${toQuery(params)}`),
  saveCat: (body) => request('/cat', { method: 'PUT', body }),

  roster: (params) => request(`/attendance/roster${toQuery(params)}`),
  saveAttendance: (body) => request('/attendance', { method: 'PUT', body }),
  attendanceReport: (params) => request(`/attendance/report${toQuery(params)}`),
  studentAttendance: (id) => request(`/attendance/students/${id}`),

  onDuty: (params) => request(`/onduty${toQuery(params)}`),
  applyOnDuty: (body) => request('/onduty', { method: 'POST', body }),
  approveOnDuty: (id) => request(`/onduty/${id}/approve`, { method: 'POST' }),
  rejectOnDuty: (id) => request(`/onduty/${id}/reject`, { method: 'POST' }),
  cancelOnDuty: (id) => request(`/onduty/${id}`, { method: 'DELETE' }),

  placements: () => request('/placements'),
  placement: (id) => request(`/placements/${id}`),
  createPlacement: (body) => request('/placements', { method: 'POST', body }),
  updatePlacement: (id, body) => request(`/placements/${id}`, { method: 'PUT', body }),
  deletePlacement: (id) => request(`/placements/${id}`, { method: 'DELETE' }),
  respondPlacement: (id, response) => request(`/placements/${id}/respond`, { method: 'POST', body: { response } }),
  saveResult: (id, studentId, body) => request(`/placements/${id}/results/${studentId}`, { method: 'PUT', body }),

  /** Files need the Authorization header, so they are fetched and handed back as blobs. */
  exportCsv: (params) => fetchBlob(`/contacts/export.csv${toQuery(params)}`),
  attendancePdf: (params) => fetchBlob(`/attendance/report.pdf${toQuery(params)}`),
  placementsPdf: (params) => fetchBlob(`/placements/report.pdf${toQuery(params)}`),
  proof: (id) => fetchBlob(`/onduty/${id}/proof`),
};

async function fetchBlob(path) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('Cannot reach the server. Check that it is running.', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'Download failed', res.status);
  }
  return { blob: await res.blob(), type: res.headers.get('content-type') || '' };
}
