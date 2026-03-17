import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const api = axios.create({
  baseURL: `${BASE}/api`,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (!window.location.pathname.includes('/login'))
        window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

export const authApi = {
  login:          d  => api.post('/auth/login', d),
  me:             () => api.get('/auth/me'),
  updateProfile:  d  => api.put('/auth/me', d),
  changePassword: d  => api.put('/auth/change-password', d),
}
export const clientsApi = {
  list:   p      => api.get('/clients', { params: p }),
  get:    id     => api.get(`/clients/${id}`),
  create: d      => api.post('/clients', d),
  update: (id,d) => api.put(`/clients/${id}`, d),
  depts:  id     => api.get(`/clients/${id}/departments`),
  addDept:(id,d) => api.post(`/clients/${id}/departments`, d),
  updDept:(cid,id,d) => api.put(`/clients/${cid}/departments/${id}`, d),
  delDept:(cid,id)   => api.delete(`/clients/${cid}/departments/${id}`),
}
export const visitsApi = {
  list:   p      => api.get('/visits', { params: p }),
  get:    id     => api.get(`/visits/${id}`),
  create: d      => api.post('/visits', d),
  update: (id,d) => api.put(`/visits/${id}`, d),
  delete: id     => api.delete(`/visits/${id}`),
  sign:   (id,d) => api.post(`/visits/${id}/sign`, d),
}
export const issuesApi = {
  list:   vid      => api.get(`/visits/${vid}/issues`),
  create: (vid,d)  => api.post(`/visits/${vid}/issues`, d),
  update: (vid,id,d)=>api.put(`/visits/${vid}/issues/${id}`, d),
  delete: (vid,id) => api.delete(`/visits/${vid}/issues/${id}`),
}
export const networkApi = {
  list:   vid      => api.get(`/visits/${vid}/network`),
  create: (vid,d)  => api.post(`/visits/${vid}/network`, d),
  update: (vid,id,d)=>api.put(`/visits/${vid}/network/${id}`, d),
  delete: (vid,id) => api.delete(`/visits/${vid}/network/${id}`),
  lookup: pid      => api.get(`/network/lookup/${pid}`),
}
export const credentialsApi = {
  list:   p      => api.get('/credentials', { params: p }),
  get:    id     => api.get(`/credentials/${id}`),
  create: d      => api.post('/credentials', d),
  update: (id,d) => api.put(`/credentials/${id}`, d),
  delete: id     => api.delete(`/credentials/${id}`),
}
export const ticketsApi = {
  list:       p      => api.get('/tickets', { params: p }),
  get:        id     => api.get(`/tickets/${id}`),
  create:     d      => api.post('/tickets', d),
  update:     (id,d) => api.put(`/tickets/${id}`, d),
  comment:    (id,d) => api.post(`/tickets/${id}/comments`, d),
}
export const reportsApi = {
  summary: p => api.get('/reports/summary', { params: p }),
}
export const usersApi = {
  list:   () => api.get('/users'),
  create: d  => api.post('/users', d),
  update: (id,d) => api.put(`/users/${id}`, d),
}
export const equipApi = {
  types:      p      => api.get('/equipment-types', { params: p }),
  addType:    d      => api.post('/equipment-types', d),
  register:   p      => api.get('/equipment-register', { params: p }),
  addItem:    d      => api.post('/equipment-register', d),
  updateItem: (id,d) => api.put(`/equipment-register/${id}`, d),
}

export const settingsApi = {
  get:        ()        => api.get('/settings'),
  getGrouped: ()        => api.get('/settings/grouped'),
  update:     settings  => api.put('/settings', { settings }),
  updateOne:  (key, val)=> api.put(`/settings/${key}`, { value: val }),
  uploadLogo: formData  => api.post('/settings/upload/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadFavicon: formData => api.post('/settings/upload/favicon', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}
