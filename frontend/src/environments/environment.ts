// Development: the dev server proxies /api to the FastAPI backend (see proxy.conf.json).
export const environment = {
  production: false,
  apiBase: '/api/v1',
  supportEmail: 'support@example.com',
};
